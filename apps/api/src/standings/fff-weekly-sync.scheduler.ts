import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FffSyncService } from '../fff-sync/fff-sync.service';
import { StandingsService } from './standings.service';

/** Matches and standings only actually change once a week — after the weekend's fixtures are
 * played, results and the league table both refresh together. Running every Monday morning
 * covers that in one shot instead of polling every few hours for nothing. `FffSyncService.sync`
 * only ever touches Match's own scraped fields (date/time/opponent/venue/competition, plus the
 * score once FFF shows a final one) — composition, events, votes, ratings, whatever the coach
 * has entered are never touched, so a coach filling in details ahead of the official result
 * being published is never at risk of being overwritten by this. */
@Injectable()
export class FffWeeklySyncScheduler {
  private readonly logger = new Logger(FffWeeklySyncScheduler.name);

  constructor(
    private readonly fffSyncService: FffSyncService,
    private readonly standingsService: StandingsService,
  ) {}

  // Monday 6am Europe/Paris — after the weekend's matches, before the week's training/vote
  // activity picks up. `CronExpression.EVERY_WEEK` runs Sunday, not Monday, hence the literal
  // cron string.
  @Cron('0 6 * * 1', { timeZone: 'Europe/Paris' })
  async handleWeeklySync() {
    try {
      const log = await this.fffSyncService.sync(null);
      this.logger.log(
        `Synchro FFF hebdomadaire (calendrier): ${log.status}, ${log.matchesCreated} créés, ${log.matchesUpdated} mis à jour`,
      );
    } catch (error) {
      this.logger.warn(`Synchro FFF hebdomadaire (calendrier) en échec: ${error instanceof Error ? error.message : error}`);
    }

    try {
      const log = await this.standingsService.sync(null);
      this.logger.log(`Synchro FFF hebdomadaire (classement): ${log.status}, ${log.teamsFound} équipes`);
    } catch (error) {
      this.logger.warn(`Synchro FFF hebdomadaire (classement) en échec: ${error instanceof Error ? error.message : error}`);
    }
  }
}
