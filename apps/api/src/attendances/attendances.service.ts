import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { PlayerSubPosition, User } from '../users/entities/user.entity';
import { pickNextWaitlisted } from './attendance-cap';

export interface GuestNameInput {
  firstName: string;
  lastName?: string;
  position?: PlayerSubPosition;
}

/** Headcount one row currently holds against the cap — the player's own confirmed slot
 * (only while PRESENT) plus however many of their guests are confirmed. Guests count
 * regardless of the inviter's own status (see team-balancing: a guest can still show up
 * even if the inviter ends up absent), so this is the one place both concerns are unified. */
function headcount(a: Pick<Attendance, 'status' | 'confirmed' | 'confirmedGuestCount'>): number {
  return (a.status === AttendanceStatus.PRESENT && a.confirmed ? 1 : 0) + a.confirmedGuestCount;
}

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(AttendanceGuest)
    private readonly attendanceGuestsRepository: Repository<AttendanceGuest>,
    @InjectRepository(AttendanceStatusChange)
    private readonly statusChangesRepository: Repository<AttendanceStatusChange>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findBySession(trainingSessionId: string): Promise<Attendance[]> {
    return this.attendancesRepository.find({
      where: { trainingSessionId },
      relations: { user: true, guests: true },
    });
  }

  /** Chronological trail of every declared-status change for a session — see
   * AttendanceStatusChange. Coach-only, for clearing up a "I never touched it" dispute. */
  findStatusHistory(trainingSessionId: string): Promise<AttendanceStatusChange[]> {
    return this.statusChangesRepository.find({
      where: { trainingSessionId },
      relations: { user: true, changer: true },
      order: { createdAt: 'ASC' },
    });
  }

  async setAttendance(
    trainingSessionId: string,
    userId: string,
    status: AttendanceStatus,
    guests: GuestNameInput[] = [],
    // Coach-only correction (see coachSetAttendance below) — a mistaken declaration ("said
    // Present, isn't coming") needs fixing regardless of the lock, since the whole point is
    // to fix it before regenerating teams. A player editing their own answer never sets this.
    bypassLock = false,
    // Who actually performed this change — the player themselves by default, or the coach's
    // id when called via setForPlayer. Logged on the history row (see AttendanceStatusChange)
    // so a disputed change can be traced back to who really made it.
    changedBy: string = userId,
  ): Promise<Attendance> {
    const session = await this.sessionsRepository.findOne({
      where: { id: trainingSessionId },
      relations: { training: true },
    });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }

    let attendance = await this.attendancesRepository.findOne({
      where: { trainingSessionId, userId },
    });

    // Locked from 30 min before kickoff — the same moment the teams get auto-generated
    // from declared presence, a late status flip would desync the teams from who's
    // actually shown up. A last-minute +1 doesn't have that problem the same way — it
    // doesn't change who the coach thinks is coming, just adds a body — so it's still
    // allowed past the lock as long as the status itself isn't changing; the coach can
    // regenerate teams afterwards to fold the guest in.
    const lockAt = new Date(`${session.date}T${session.startTime}`).getTime() - 30 * 60_000;
    const statusChanged = !attendance || attendance.status !== status;
    if (!bypassLock && Date.now() >= lockAt && statusChanged) {
      throw new BadRequestException(
        "Les équipes ont été générées, tu ne peux plus modifier ta présence",
      );
    }

    // Captured before this row is mutated — used below to log what actually changed (see
    // AttendanceStatusChange) and to decide whether the player's own slot is up for
    // re-evaluation (sticky: only on a genuine new PRESENT arrival, see below).
    const previousStatus = attendance?.status ?? null;
    const previousConfirmed = attendance?.confirmed ?? true;
    const previousConfirmedGuestCount = attendance?.confirmedGuestCount ?? 0;
    const wasConfirmedPresent = previousStatus === AttendanceStatus.PRESENT && previousConfirmed;

    if (!attendance) {
      attendance = this.attendancesRepository.create({
        trainingSessionId,
        userId,
        status,
        guestCount: guests.length,
        respondedAt: new Date(),
      });
    } else {
      attendance.status = status;
      attendance.guestCount = guests.length;
      attendance.respondedAt = new Date();
    }

    // Headcount allocation against the cap — the player's own slot (sticky: decided once,
    // on a genuine new PRESENT arrival, never re-evaluated by re-declaring) plus this row's
    // guest slots (recomputed on every call, since a guest list is freshly redeclared each
    // time). Both draw from the SAME pool — a confirmed player couldn't otherwise blow past
    // the cap by piling on guests. Cap enforcement never blocks the write itself, only these
    // flags — see the entity doc.
    const cap = session.training?.maxPresentPlayers ?? null;
    if (cap == null) {
      if (status !== AttendanceStatus.PRESENT) {
        attendance.confirmed = true;
      } else if (!wasConfirmedPresent) {
        attendance.confirmed = true;
      }
      attendance.confirmedGuestCount = guests.length;
    } else {
      const others = await this.attendancesRepository.find({
        where: { trainingSessionId },
        relations: { user: true },
      });
      let otherHeadcount = others
        .filter((a) => a.userId !== userId)
        .reduce((sum, a) => sum + headcount(a), 0);

      if (status !== AttendanceStatus.PRESENT) {
        attendance.confirmed = true;
      } else if (!wasConfirmedPresent) {
        if (otherHeadcount < cap) {
          attendance.confirmed = true;
        } else {
          // Full — a licensed player arriving late still bumps the most recently
          // confirmed non-licensed player back to the waitlist instead of joining it
          // themselves (see evictLastNonLicensed). Anyone else — including a second
          // licensed player fighting over the same last slot — just waitlists.
          const arrivingUser = await this.usersRepository.findOne({ where: { id: userId } });
          const evicted = arrivingUser?.isLicensed
            ? await this.evictLastNonLicensed(trainingSessionId, others, userId)
            : null;
          if (evicted) {
            otherHeadcount -= evicted.freedHeadcount;
            attendance.confirmed = true;
          } else {
            attendance.confirmed = false;
          }
        }
      }
      const selfSlot = status === AttendanceStatus.PRESENT && attendance.confirmed ? 1 : 0;
      const remainingForGuests = cap - otherHeadcount - selfSlot;
      attendance.confirmedGuestCount = Math.max(0, Math.min(guests.length, remainingForGuests));
    }

    attendance = await this.attendancesRepository.save(attendance);

    await this.statusChangesRepository.save(
      this.statusChangesRepository.create({
        trainingSessionId,
        userId,
        changedBy,
        previousStatus,
        newStatus: attendance.status!,
        previousConfirmed,
        newConfirmed: attendance.confirmed,
        previousConfirmedGuestCount,
        newConfirmedGuestCount: attendance.confirmedGuestCount,
      }),
    );

    if (cap != null) {
      const freed =
        (previousStatus === AttendanceStatus.PRESENT && previousConfirmed ? 1 : 0) +
        previousConfirmedGuestCount -
        headcount(attendance);
      if (freed > 0) {
        await this.promoteWaitlist(trainingSessionId, cap);
      }
    }

    await this.attendanceGuestsRepository.delete({ attendanceId: attendance.id });
    attendance.guests = guests.length
      ? await this.attendanceGuestsRepository.save(
          guests.map((g) =>
            this.attendanceGuestsRepository.create({
              attendanceId: attendance.id,
              firstName: g.firstName,
              lastName: g.lastName ?? null,
              position: g.position ?? null,
            }),
          ),
        )
      : [];

    return attendance;
  }

  /** Headcount just freed up — fills it as far as it goes, one unit of demand at a time:
   * first any waitlisted PLAYER (licensed, then longest-waiting — see pickNextWaitlisted),
   * who brings themselves AND as many of their own already-declared guests as fit; once no
   * waitlisted player fits any more, tops up already-confirmed players' own unmet guest
   * demand (oldest declaration first). Nobody "did" any of this — it's a side effect of
   * someone else's headcount shrinking — so changedBy is always the promoted row's own
   * userId. */
  private async promoteWaitlist(trainingSessionId: string, cap: number): Promise<void> {
    for (;;) {
      const rows = await this.attendancesRepository.find({
        where: { trainingSessionId, status: AttendanceStatus.PRESENT },
        relations: { user: true },
      });
      const used = rows.reduce((sum, a) => sum + headcount(a), 0);
      const room = cap - used;
      if (room <= 0) return;

      const waitlisted = rows.filter((a) => !a.confirmed);
      const nextPlayer = pickNextWaitlisted(waitlisted);
      if (nextPlayer) {
        const previousConfirmed = nextPlayer.confirmed;
        const previousConfirmedGuestCount = nextPlayer.confirmedGuestCount;
        nextPlayer.confirmed = true;
        const guestRoom = Math.max(0, room - 1);
        nextPlayer.confirmedGuestCount = Math.min(
          nextPlayer.guestCount,
          previousConfirmedGuestCount + guestRoom,
        );
        await this.attendancesRepository.save(nextPlayer);
        await this.statusChangesRepository.save(
          this.statusChangesRepository.create({
            trainingSessionId,
            userId: nextPlayer.userId,
            changedBy: nextPlayer.userId,
            previousStatus: AttendanceStatus.PRESENT,
            newStatus: AttendanceStatus.PRESENT,
            previousConfirmed,
            newConfirmed: true,
            previousConfirmedGuestCount,
            newConfirmedGuestCount: nextPlayer.confirmedGuestCount,
          }),
        );
        continue;
      }

      const withShortfall = rows
        .filter((a) => a.confirmed && a.guestCount > a.confirmedGuestCount)
        .sort((a, b) => a.respondedAt.getTime() - b.respondedAt.getTime());
      const next = withShortfall[0];
      if (!next) return;
      const previousConfirmedGuestCount = next.confirmedGuestCount;
      next.confirmedGuestCount = Math.min(next.guestCount, previousConfirmedGuestCount + room);
      await this.attendancesRepository.save(next);
      await this.statusChangesRepository.save(
        this.statusChangesRepository.create({
          trainingSessionId,
          userId: next.userId,
          changedBy: next.userId,
          previousStatus: AttendanceStatus.PRESENT,
          newStatus: AttendanceStatus.PRESENT,
          previousConfirmed: true,
          newConfirmed: true,
          previousConfirmedGuestCount,
          newConfirmedGuestCount: next.confirmedGuestCount,
        }),
      );
    }
  }

  /** A licensed player declaring PRESENT into an already-full cap bumps the most recently
   * confirmed non-licensed player back to the waitlist instead of joining it themselves —
   * they've paid to train, a non-licensed member hasn't (same priority as promoteWaitlist,
   * just triggered the other direction: a slot doesn't have to free up naturally first).
   * Demotes at most one row, and only when a genuine non-licensed candidate is currently
   * holding a confirmed slot — two licensed players contesting the same last slot still
   * resolve first-come-first-served. */
  private async evictLastNonLicensed(
    trainingSessionId: string,
    others: Attendance[],
    arrivingUserId: string,
  ): Promise<{ freedHeadcount: number } | null> {
    const candidates = others
      .filter(
        (a) =>
          a.userId !== arrivingUserId &&
          a.status === AttendanceStatus.PRESENT &&
          a.confirmed &&
          a.user &&
          !a.user.isLicensed,
      )
      .sort((a, b) => b.respondedAt.getTime() - a.respondedAt.getTime());
    const evicted = candidates[0];
    if (!evicted) return null;

    const freedHeadcount = headcount(evicted);
    const previousConfirmed = evicted.confirmed;
    const previousConfirmedGuestCount = evicted.confirmedGuestCount;
    evicted.confirmed = false;
    evicted.confirmedGuestCount = 0;
    await this.attendancesRepository.save(evicted);

    await this.statusChangesRepository.save(
      this.statusChangesRepository.create({
        trainingSessionId,
        userId: evicted.userId,
        changedBy: arrivingUserId,
        previousStatus: evicted.status!,
        newStatus: evicted.status!,
        previousConfirmed,
        newConfirmed: false,
        previousConfirmedGuestCount,
        newConfirmedGuestCount: 0,
      }),
    );

    return { freedHeadcount };
  }

  /** Coach-only: records what actually happened, independently of what the player declared.
   * Creates the row if the player never responded at all. */
  async validateAttendance(
    trainingSessionId: string,
    userId: string,
    actualStatus: AttendanceStatus,
  ): Promise<Attendance> {
    let attendance = await this.attendancesRepository.findOne({
      where: { trainingSessionId, userId },
    });

    if (!attendance) {
      // The player never responded to the poll at all — this row exists purely to record
      // what the coach observed, so respondedAt (a "when did the PLAYER declare a status"
      // timestamp) is set to now only because the column can't be null, not because this
      // counts as their own response.
      attendance = this.attendancesRepository.create({
        trainingSessionId,
        userId,
        status: null,
        actualStatus,
        respondedAt: new Date(),
      });
    } else {
      attendance.actualStatus = actualStatus;
    }

    return this.attendancesRepository.save(attendance);
  }
}
