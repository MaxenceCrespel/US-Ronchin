import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamStanding } from './entities/team-standing.entity';
import { PoolMatch } from './entities/pool-match.entity';
import { CupMatch } from './entities/cup-match.entity';
import { StandingsSyncLog } from './entities/standings-sync-log.entity';
import { Match } from '../matches/entities/match.entity';
import { User } from '../users/entities/user.entity';
import { StandingsService } from './standings.service';
import { StandingsController } from './standings.controller';
import { SettingsModule } from '../settings/settings.module';
import { FffSyncModule } from '../fff-sync/fff-sync.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeamStanding, PoolMatch, CupMatch, StandingsSyncLog, Match, User]),
    SettingsModule,
    FffSyncModule,
    PushNotificationsModule,
  ],
  controllers: [StandingsController],
  providers: [StandingsService],
})
export class StandingsModule {}
