import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { MatchEvent } from '../matches/entities/match-event.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { PlayerRating } from '../matches/entities/player-rating.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      MatchEvent,
      MatchComposition,
      PlayerRating,
      MatchMotmVote,
      Attendance,
      TrainingSession,
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
