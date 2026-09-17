import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { TrainingTeamAssignment } from '../team-balancing/entities/training-team-assignment.entity';
import { User } from '../users/entities/user.entity';
import { AttendancesService } from './attendances.service';
import { AttendancesController } from './attendances.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Attendance,
      AttendanceGuest,
      AttendanceStatusChange,
      TrainingSession,
      TrainingTeamAssignment,
      User,
    ]),
  ],
  controllers: [AttendancesController],
  providers: [AttendancesService],
  exports: [AttendancesService],
})
export class AttendancesModule {}
