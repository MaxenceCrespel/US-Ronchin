import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { AttendancesService } from './attendances.service';
import { AttendancesController } from './attendances.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, AttendanceGuest, TrainingSession])],
  controllers: [AttendancesController],
  providers: [AttendancesService],
})
export class AttendancesModule {}
