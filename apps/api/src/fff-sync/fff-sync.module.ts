import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from '../matches/entities/match.entity';
import { FffSyncLog } from './entities/fff-sync-log.entity';
import { SettingsModule } from '../settings/settings.module';
import { FffScraperService } from './fff-scraper.service';
import { FffSyncService } from './fff-sync.service';
import { FffSyncController } from './fff-sync.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Match, FffSyncLog]), SettingsModule],
  controllers: [FffSyncController],
  providers: [FffScraperService, FffSyncService],
  // FffSyncService is needed by StandingsModule's weekly scheduler, which runs the matches
  // sync and the standings sync back to back — see standings/fff-weekly-sync.scheduler.ts.
  exports: [FffScraperService, FffSyncService],
})
export class FffSyncModule {}
