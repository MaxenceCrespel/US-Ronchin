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
  ): Promise<Attendance> {
    const session = await this.sessionsRepository.findOne({ where: { id: trainingSessionId } });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }
    const hasStarted =
      new Date(`${session.date}T${session.startTime}`).getTime() <= Date.now();
    if (hasStarted) {
      throw new BadRequestException(
        "L'entraînement a déjà commencé, tu ne peux plus modifier ta présence",
      );
    }

    let attendance = await this.attendancesRepository.findOne({
      where: { trainingSessionId, userId },
    });

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
