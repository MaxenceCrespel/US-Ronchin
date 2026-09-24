import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscription } from './entities/push-subscription.entity';
import { AttendancePollReminder } from './entities/attendance-poll-reminder.entity';
import { User } from '../users/entities/user.entity';
import { Match } from '../matches/entities/match.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { MatchAttendance } from '../matches/entities/match-attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from '../matches/entities/match-defense-boss-vote.entity';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsScheduler } from './push-notifications.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscription,
      AttendancePollReminder,
      User,
      Match,
      TrainingSession,
      Attendance,
      MatchAttendance,
      MatchComposition,
      MatchMotmVote,
      MatchDefenseBossVote,
    ]),
  ],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsService, PushNotificationsScheduler],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
