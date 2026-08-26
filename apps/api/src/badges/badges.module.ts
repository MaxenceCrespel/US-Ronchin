import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBadge } from './entities/user-badge.entity';
import { MatchEvent } from '../matches/entities/match-event.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { User } from '../users/entities/user.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from '../matches/entities/match-defense-boss-vote.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchAttendance } from '../matches/entities/match-attendance.entity';
import { PlayerRating } from '../matches/entities/player-rating.entity';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { BadgesScheduler } from './badges.scheduler';
import { StatsModule } from '../stats/stats.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserBadge,
      MatchEvent,
      MatchComposition,
      Attendance,
      User,
      TrainingSession,
      MatchMotmVote,
      MatchDefenseBossVote,
      Match,
      MatchAttendance,
      PlayerRating,
    ]),
    StatsModule,
    PushNotificationsModule,
  ],
  controllers: [BadgesController],
  providers: [BadgesService, BadgesScheduler],
})
export class BadgesModule {}
