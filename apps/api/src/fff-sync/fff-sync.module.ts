import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from '../matches/entities/match.entity';
import { FffSyncLog } from './entities/fff-sync-log.entity';
import { SettingsModule } from '../settings/settings.module';
import { FffScraperService } from './fff-scraper.service';
import { FffSyncService } from './fff-sync.service';
import { FffSyncController } from './fff-sync.controller';
import { FffSyncScheduler } from './fff-sync.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Match, FffSyncLog]), SettingsModule],
  controllers: [FffSyncController],
  providers: [FffScraperService, FffSyncService, FffSyncScheduler],
  exports: [FffScraperService],
})
export class FffSyncModule {}
