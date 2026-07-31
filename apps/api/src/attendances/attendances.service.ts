import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
  ) {}

  findBySession(trainingSessionId: string): Promise<Attendance[]> {
    return this.attendancesRepository.find({
      where: { trainingSessionId },
      relations: { user: true },
    });
  }

  async setAttendance(
    trainingSessionId: string,
    userId: string,
    status: AttendanceStatus,
    guestCount = 0,
  ): Promise<Attendance> {
    let attendance = await this.attendancesRepository.findOne({
      where: { trainingSessionId, userId },
    });

    if (!attendance) {
      attendance = this.attendancesRepository.create({
        trainingSessionId,
        userId,
        status,
        guestCount,
      });
    } else {
      attendance.status = status;
      attendance.guestCount = guestCount;
    }

    return this.attendancesRepository.save(attendance);
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
