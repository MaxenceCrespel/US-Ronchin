import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';

export interface GuestNameInput {
  firstName: string;
  lastName?: string;
}

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(AttendanceGuest)
    private readonly attendanceGuestsRepository: Repository<AttendanceGuest>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
  ) {}

  findBySession(trainingSessionId: string): Promise<Attendance[]> {
    return this.attendancesRepository.find({
      where: { trainingSessionId },
      relations: { user: true, guests: true },
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
  ): Promise<Attendance> {
    const session = await this.sessionsRepository.findOne({ where: { id: trainingSessionId } });
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

    if (!attendance) {
      attendance = this.attendancesRepository.create({
        trainingSessionId,
        userId,
        status,
        guestCount: guests.length,
      });
    } else {
      attendance.status = status;
      attendance.guestCount = guests.length;
    }
    attendance = await this.attendancesRepository.save(attendance);

    await this.attendanceGuestsRepository.delete({ attendanceId: attendance.id });
    attendance.guests = guests.length
      ? await this.attendanceGuestsRepository.save(
          guests.map((g) =>
            this.attendanceGuestsRepository.create({
              attendanceId: attendance.id,
              firstName: g.firstName,
              lastName: g.lastName ?? null,
            }),
          ),
        )
      : [];

    return attendance;
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
      attendance = this.attendancesRepository.create({
        trainingSessionId,
        userId,
        status: null,
        actualStatus,
      });
    } else {
      attendance.actualStatus = actualStatus;
    }

    return this.attendancesRepository.save(attendance);
  }
}
