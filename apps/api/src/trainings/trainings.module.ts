import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { User } from '../users/entities/user.entity';
import { AttendancesModule } from '../attendances/attendances.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { TrainingsService } from './trainings.service';
import { TrainingsController } from './trainings.controller';
import { TrainingsScheduler } from './trainings.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Training, TrainingSession, Attendance, User]),
    AttendancesModule,
    PushNotificationsModule,
  ],
  controllers: [TrainingsController],
  providers: [TrainingsService, TrainingsScheduler],
  exports: [TrainingsService],
})
export class TrainingsModule {}
