import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { TrainingTeamAssignment } from '../team-balancing/entities/training-team-assignment.entity';
import { PlayerSubPosition, User } from '../users/entities/user.entity';
import { pickNextWaitlisted, pickRowToLoseAGuest, priorityRank } from './attendance-cap';

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
    @InjectRepository(TrainingTeamAssignment)
    private readonly assignmentsRepository: Repository<TrainingTeamAssignment>,
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

    // Locked once the session starts. Teams are auto-generated earlier (1h30 before), but a
    // late declaration still has to work: a player turning PRESENT after that is placed on a
    // team (or waitlisted if the cap is full) by syncTeamMembership below, and turning
    // ABSENT/INCERTAIN takes them back off it — so nothing here needs the status frozen
    // ahead of kickoff. A +1 is still allowed past the lock as long as the status itself
    // isn't changing.
    const lockAt = new Date(`${session.date}T${session.startTime}`).getTime();
    const statusChanged = !attendance || attendance.status !== status;
    if (!bypassLock && Date.now() >= lockAt && statusChanged) {
      throw new BadRequestException(
        "L'entraînement a commencé, tu ne peux plus modifier ta présence",
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
    const cap = session.maxPresentPlayersOverride ?? session.training?.maxPresentPlayers ?? null;
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
          // Full. A confirmed GUEST always gives way first: a player with an account outranks
          // any guest, whoever brought them (see pickRowToLoseAGuest) — so if a guest holds a
          // place, that's the one the arriving player takes, without touching any player.
          if (await this.evictGuest(trainingSessionId, others, userId)) {
            otherHeadcount -= 1;
            attendance.confirmed = true;
          } else {
            // No guest to bump — an arriving player who outranks the lowest-priority
            // confirmed player still bumps them back to the waitlist instead of joining it
            // themselves (see evictLowerPriority) — not just "licensed bumps non-licensed"
            // but the full 3-tier priority (licensed, then seniority bracket). Two players of
            // equal rank fighting over the same last slot still just waitlists the later one.
            const arrivingUser = await this.usersRepository.findOne({ where: { id: userId } });
            const evicted = arrivingUser
              ? await this.evictLowerPriority(trainingSessionId, others, userId, arrivingUser)
              : null;
            if (evicted) {
              otherHeadcount -= evicted.freedHeadcount;
              attendance.confirmed = true;
            } else {
              attendance.confirmed = false;
            }
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

    await this.syncTeamMembership(trainingSessionId, userId, attendance);

    return attendance;
  }

  /** Keeps the team split in step with a declared status once teams exist for the session.
   * Effectively present — a confirmed PRESENT (not waitlisted), or the coach's pointage réel
   * when there is one, exactly as generateTeams reads it — and not yet on a team: placed on
   * whichever team is currently smallest. No longer effectively present (turned ABSENT /
   * INCERTAIN, or bumped to the waitlist): their slot is taken off the team, which the
   * waitlist promotion that follows can then hand to the next person. No-op when no teams
   * exist yet. */
  private async syncTeamMembership(
    trainingSessionId: string,
    userId: string,
    attendance: Pick<Attendance, 'status' | 'confirmed' | 'actualStatus'>,
  ): Promise<void> {
    const effectivelyPresent =
      attendance.actualStatus != null
        ? attendance.actualStatus === AttendanceStatus.PRESENT
        : attendance.status === AttendanceStatus.PRESENT && attendance.confirmed;
    if (!effectivelyPresent) {
      await this.assignmentsRepository.delete({ trainingSessionId, userId });
      return;
    }

    const existingAssignments = await this.assignmentsRepository.find({
      where: { trainingSessionId },
    });
    if (existingAssignments.length === 0) return;
    if (existingAssignments.some((a) => a.userId === userId)) return;

    const teamCount = Math.max(2, Math.max(...existingAssignments.map((a) => a.teamIndex)) + 1);
    const teamCounts = new Array(teamCount).fill(0);
    for (const a of existingAssignments) teamCounts[a.teamIndex]++;
    let minTeam = 0;
    for (let i = 1; i < teamCount; i++) {
      if (teamCounts[i] < teamCounts[minTeam]) minTeam = i;
    }

    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        trainingSessionId,
        userId,
        guestLabel: null,
        teamIndex: minTeam,
      }),
    );
  }

  /** Called by TrainingsService whenever a session's effective cap might have just gone up
   * — raising the training template's maxPresentPlayers, or setting a higher per-session
   * override, never touches any Attendance row on its own, so anyone already waitlisted
   * stayed waitlisted even though there's now room. Promotes as many as now fit, same
   * priority as a slot freeing up naturally (see promoteWaitlist). No-op if the session has
   * no cap or nothing changed. */
  async syncCapPromotions(trainingSessionId: string): Promise<void> {
    const session = await this.sessionsRepository.findOne({
      where: { id: trainingSessionId },
      relations: { training: true },
    });
    if (!session) return;
    const cap = session.maxPresentPlayersOverride ?? session.training?.maxPresentPlayers ?? null;
    if (cap == null) return;
    await this.promoteWaitlist(trainingSessionId, cap);
  }

  /** Headcount just freed up — fills it as far as it goes, one unit of demand at a time:
   * first any waitlisted PLAYER (licensed, then longest-waiting — see pickNextWaitlisted),
   * one place each and WITHOUT their guests; only once no waitlisted player is left does the
   * remaining room go to unmet guest demand (oldest declaration first). A guest ranks below
   * every player with an account (see pickRowToLoseAGuest), so no guest gets a place while a
   * player is still waiting — not even the guest of the very player being promoted.
   * Nobody "did" any of this — it's a side effect of someone else's headcount shrinking — so
   * changedBy is always the promoted row's own userId. */
  private async promoteWaitlist(trainingSessionId: string, cap: number): Promise<void> {
    for (;;) {
      // Not filtered to status: PRESENT — a guest counts against the cap regardless of
      // whether the inviting player themselves ends up Absent/Incertain (see headcount() and
      // Attendance.confirmedGuestCount's own doc comment), so an Absent row with unpromoted
      // guests still needs to be visible here, or the room they'd fit in silently vanishes.
      const rows = await this.attendancesRepository.find({
        where: { trainingSessionId },
        relations: { user: true },
      });
      const used = rows.reduce((sum, a) => sum + headcount(a), 0);
      const room = cap - used;
      if (room <= 0) return;

      // Safe against the wider row set above: setAttendance always forces confirmed=true
      // for any non-PRESENT status, so only a genuinely waitlisted PRESENT row ever has
      // confirmed=false — an Absent/Incertain row never ends up in here.
      const waitlisted = rows.filter((a) => !a.confirmed);
      const nextPlayer = pickNextWaitlisted(waitlisted);
      if (nextPlayer) {
        const previousConfirmed = nextPlayer.confirmed;
        const previousConfirmedGuestCount = nextPlayer.confirmedGuestCount;
        nextPlayer.confirmed = true;
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
        await this.syncTeamMembership(trainingSessionId, nextPlayer.userId, nextPlayer);
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
          // The bringer's own status here isn't necessarily PRESENT any more (that's the
          // whole point of the fix above) — only their guest count is changing, so log
          // their real, unchanged status rather than assuming PRESENT.
          previousStatus: next.status!,
          newStatus: next.status!,
          previousConfirmed: true,
          newConfirmed: true,
          previousConfirmedGuestCount,
          newConfirmedGuestCount: next.confirmedGuestCount,
        }),
      );
    }
  }

  /** A player with an account declaring PRESENT into an already-full cap takes the place of
   * a confirmed guest, if any holds one — guests rank below every player (see
   * pickRowToLoseAGuest), whoever brought them. Takes ONE place: the most recently declared
   * guest goes first, and the row that brought them keeps its own place and its other guests.
   * The row that lost a guest gets a history entry (changedBy the arriving player), same as
   * evictLowerPriority. Returns whether a guest was bumped. */
  private async evictGuest(
    trainingSessionId: string,
    others: Attendance[],
    arrivingUserId: string,
  ): Promise<boolean> {
    const row = pickRowToLoseAGuest(others.filter((a) => a.userId !== arrivingUserId));
    if (!row) return false;

    const previousConfirmedGuestCount = row.confirmedGuestCount;
    row.confirmedGuestCount = previousConfirmedGuestCount - 1;
    await this.attendancesRepository.save(row);

    await this.statusChangesRepository.save(
      this.statusChangesRepository.create({
        trainingSessionId,
        userId: row.userId,
        changedBy: arrivingUserId,
        previousStatus: row.status!,
        newStatus: row.status!,
        previousConfirmed: row.confirmed,
        newConfirmed: row.confirmed,
        previousConfirmedGuestCount,
        newConfirmedGuestCount: row.confirmedGuestCount,
      }),
    );
    return true;
  }

  /** A player declaring PRESENT into an already-full cap bumps a lower-priority confirmed
   * player back to the waitlist instead of joining it themselves — the full 3-tier
   * priority (licensed, then seniority bracket: +7 ans > 3-7 ans > 1-3 ans > pas de palier),
   * same ranking as pickNextWaitlisted, just triggered the other direction: a slot doesn't
   * have to free up naturally first. Among candidates the arriving player actually outranks,
   * the lowest-ranked one is bumped first; within the same rank, the most recently confirmed
   * goes first (LIFO). Demotes at most one row, and only when a genuine lower-ranked
   * candidate is currently holding a confirmed slot — two players of equal rank contesting
   * the same last slot still resolve first-come-first-served. */
  private async evictLowerPriority(
    trainingSessionId: string,
    others: Attendance[],
    arrivingUserId: string,
    arrivingUser: User,
  ): Promise<{ freedHeadcount: number } | null> {
    const arrivingRank = priorityRank(arrivingUser);
    const candidates = others
      .filter(
        (a) =>
          a.userId !== arrivingUserId &&
          a.status === AttendanceStatus.PRESENT &&
          a.confirmed &&
          a.user &&
          priorityRank(a.user) < arrivingRank,
      )
      .sort((a, b) => {
        const rankDiff = priorityRank(a.user) - priorityRank(b.user);
        if (rankDiff !== 0) return rankDiff;
        return b.respondedAt.getTime() - a.respondedAt.getTime();
      });
    const evicted = candidates[0];
    if (!evicted) return null;

    const freedHeadcount = headcount(evicted);
    const previousConfirmed = evicted.confirmed;
    const previousConfirmedGuestCount = evicted.confirmedGuestCount;
    evicted.confirmed = false;
    evicted.confirmedGuestCount = 0;
    await this.attendancesRepository.save(evicted);
    // Now waitlisted: off their team too, or they'd keep a place the arriving player took.
    await this.syncTeamMembership(trainingSessionId, evicted.userId, evicted);

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
