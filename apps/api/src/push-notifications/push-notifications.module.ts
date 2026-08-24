import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { User } from '../users/entities/user.entity';
import { Match } from '../matches/entities/match.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsScheduler } from './push-notifications.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscription, User, Match, TrainingSession, Attendance]),
  ],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsService, PushNotificationsScheduler],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
