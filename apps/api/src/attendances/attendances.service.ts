import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { PlayerSubPosition } from '../users/entities/user.entity';
import { pickNextWaitlisted } from './attendance-cap';

export interface GuestNameInput {
  firstName: string;
  lastName?: string;
  position?: PlayerSubPosition;
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

    // Captured before this row is mutated — used below to detect a PRESENT→(something else)
    // transition that frees up a confirmed slot for someone else on the waitlist, and to log
    // what actually changed (see AttendanceStatusChange).
    const previousStatus = attendance?.status ?? null;
    const previousConfirmed = attendance?.confirmed ?? true;
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

    // Whether THIS response gets a confirmed slot or lands on the waitlist. A slot, once
    // granted, sticks with whoever holds it — re-declaring PRESENT (e.g. just to add a
    // guest) never re-evaluates someone who already has one. Cap enforcement never blocks
    // the write itself, only this flag — see the entity doc.
    const cap = session.training?.maxPresentPlayers ?? null;
    if (status !== AttendanceStatus.PRESENT) {
      attendance.confirmed = true;
    } else if (!wasConfirmedPresent) {
      const confirmedCount = await this.attendancesRepository.count({
        where: { trainingSessionId, status: AttendanceStatus.PRESENT, confirmed: true },
      });
      attendance.confirmed = cap == null || confirmedCount < cap;
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
      }),
    );

    if (wasConfirmedPresent && status !== AttendanceStatus.PRESENT) {
      await this.promoteNextWaitlisted(trainingSessionId);
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

  /** A confirmed PRESENT slot just freed up — hands it to whoever's next in line (licensed
   * players first, then longest-waiting) among those still on the waitlist for this
   * session, if anyone is. See pickNextWaitlisted. */
  private async promoteNextWaitlisted(trainingSessionId: string): Promise<void> {
    const waitlisted = await this.attendancesRepository.find({
      where: { trainingSessionId, status: AttendanceStatus.PRESENT, confirmed: false },
      relations: { user: true },
    });
    const next = pickNextWaitlisted(waitlisted);
    if (!next) return;
    next.confirmed = true;
    await this.attendancesRepository.save(next);
    // Nobody "did" this — it's a side effect of someone else leaving — so changedBy is the
    // promoted player themselves, not whoever triggered it (that's a separate history row).
    await this.statusChangesRepository.save(
      this.statusChangesRepository.create({
        trainingSessionId,
        userId: next.userId,
        changedBy: next.userId,
        previousStatus: AttendanceStatus.PRESENT,
        newStatus: AttendanceStatus.PRESENT,
        previousConfirmed: false,
        newConfirmed: true,
      }),
    );
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
