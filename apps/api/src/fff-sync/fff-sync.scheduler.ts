import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FffSyncService } from './fff-sync.service';

@Injectable()
export class FffSyncScheduler {
  private readonly logger = new Logger(FffSyncScheduler.name);

  constructor(private readonly fffSyncService: FffSyncService) {}

  @Cron('0 */6 * * *', { timeZone: 'Europe/Paris' })
  async handleScheduledSync() {
    try {
      const log = await this.fffSyncService.sync(null);
      this.logger.log(
        `Synchro FFF planifiée: ${log.status}, ${log.matchesCreated} créés, ${log.matchesUpdated} mis à jour`,
      );
    } catch (error) {
      this.logger.warn(`Synchro FFF planifiée en échec: ${error instanceof Error ? error.message : error}`);
    }
  }
}
