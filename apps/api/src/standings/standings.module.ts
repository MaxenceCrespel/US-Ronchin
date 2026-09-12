import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamStanding } from './entities/team-standing.entity';
import { StandingsSyncLog } from './entities/standings-sync-log.entity';
import { StandingsService } from './standings.service';
import { StandingsController } from './standings.controller';
import { SettingsModule } from '../settings/settings.module';
import { FffSyncModule } from '../fff-sync/fff-sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeamStanding, StandingsSyncLog]),
    SettingsModule,
    FffSyncModule,
  ],
  controllers: [StandingsController],
  providers: [StandingsService],
})
export class StandingsModule {}
