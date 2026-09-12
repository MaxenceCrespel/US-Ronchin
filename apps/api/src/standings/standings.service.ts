import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TeamStanding } from './entities/team-standing.entity';
import { StandingsSyncLog, StandingsSyncStatus } from './entities/standings-sync-log.entity';
import { SettingsService } from '../settings/settings.service';
import { FffScraperService } from '../fff-sync/fff-scraper.service';
import { normalize } from '../pdf-import/player-matching';
import type { ScrapedStanding } from '../fff-sync/scraped-standing';

@Injectable()
export class StandingsService {
  private readonly logger = new Logger(StandingsService.name);

  constructor(
    @InjectRepository(TeamStanding)
    private readonly standingsRepository: Repository<TeamStanding>,
    @InjectRepository(StandingsSyncLog)
    private readonly logsRepository: Repository<StandingsSyncLog>,
    private readonly settingsService: SettingsService,
    private readonly scraperService: FffScraperService,
    private readonly configService: ConfigService,
  ) {}

  findAll(): Promise<TeamStanding[]> {
    return this.standingsRepository.find({ order: { rank: 'ASC' } });
  }

  /** Scrapes epreuves.fff.fr itself and applies the result — see FffSyncService.sync's own
   * doc comment for why this is expected to fail from the production server specifically
   * (blocked by the site's WAF) and why `importScraped` exists as the path that's actually
   * used there. */
  async sync(triggeredBy: string | null = null): Promise<StandingsSyncLog> {
    const settings = await this.settingsService.get();
    if (!settings.fffTeamUrl) {
      throw new BadRequestException(
        "Aucune URL d'équipe FFF configurée — renseigne-la dans Paramètres avant de synchroniser.",
      );
    }

    try {
      const scraped = await this.scraperService.scrapeStandings(settings.fffTeamUrl);
      return this.applyScraped(scraped, triggeredBy);
    } catch (error) {
      return this.logError(error, triggeredBy);
    }
  }

  /** Applies standings scraped elsewhere — see FffSyncService.importScraped's own doc comment;
   * this is the standings half of the exact same local-script workaround. No network call to
   * epreuves.fff.fr happens on this path at all. */
  async importScraped(scraped: ScrapedStanding[], triggeredBy: string | null = null): Promise<StandingsSyncLog> {
    try {
      return await this.applyScraped(scraped, triggeredBy);
    } catch (error) {
      return this.logError(error, triggeredBy);
    }
  }

  private async applyScraped(scraped: ScrapedStanding[], triggeredBy: string | null): Promise<StandingsSyncLog> {
    const clubName = this.configService.get<string>('CLUB_NAME', 'Ronchin');
    const normalizedClub = normalize(clubName);

    await this.standingsRepository.clear();
    if (scraped.length > 0) {
      const entities = scraped.map((s) =>
        this.standingsRepository.create({
          ...s,
          isUs: normalize(s.teamName).includes(normalizedClub),
        }),
      );
      await this.standingsRepository.save(entities);
    }

    const log = this.logsRepository.create({
      status: StandingsSyncStatus.SUCCESS,
      teamsFound: scraped.length,
      errorMessage: null,
      triggeredBy,
    });
    return this.logsRepository.save(log);
  }

  private logError(error: unknown, triggeredBy: string | null): Promise<StandingsSyncLog> {
    this.logger.error('Échec de la synchronisation du classement', error);
    const log = this.logsRepository.create({
      status: StandingsSyncStatus.ERROR,
      teamsFound: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
      triggeredBy,
    });
    return this.logsRepository.save(log);
  }

  getRecentLogs(limit: number): Promise<StandingsSyncLog[]> {
    return this.logsRepository.find({ order: { runAt: 'DESC' }, take: limit });
  }
}
