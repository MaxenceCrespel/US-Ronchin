import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity';
import { MatchComposition } from './entities/match-composition.entity';
import { MatchEvent } from './entities/match-event.entity';
import { PlayerRating } from './entities/player-rating.entity';
import { MatchRatingSubmission } from './entities/match-rating-submission.entity';
import { MatchAttendance } from './entities/match-attendance.entity';
import { MatchMotmVote } from './entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from './entities/match-defense-boss-vote.entity';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Match,
      MatchComposition,
      MatchEvent,
      PlayerRating,
      MatchRatingSubmission,
      MatchAttendance,
      MatchMotmVote,
      MatchDefenseBossVote,
    ]),
    PushNotificationsModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService, TypeOrmModule],
})
export class MatchesModule {}
