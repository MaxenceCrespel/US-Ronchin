import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TeamStanding } from './entities/team-standing.entity';
import { PoolMatch } from './entities/pool-match.entity';
import { CupMatch } from './entities/cup-match.entity';
import { StandingsSyncLog, StandingsSyncStatus } from './entities/standings-sync-log.entity';
import { SettingsService } from '../settings/settings.service';
import { FffScraperService } from '../fff-sync/fff-scraper.service';
import { normalize } from '../pdf-import/player-matching';
import type { ScrapedStanding } from '../fff-sync/scraped-standing';
import type { ScrapedPoolMatch } from '../fff-sync/scraped-pool-match';
import type { ScrapedCupMatch } from '../fff-sync/scraped-cup-match';

@Injectable()
export class StandingsService {
  private readonly logger = new Logger(StandingsService.name);

  constructor(
    @InjectRepository(TeamStanding)
    private readonly standingsRepository: Repository<TeamStanding>,
    @InjectRepository(PoolMatch)
    private readonly poolMatchesRepository: Repository<PoolMatch>,
    @InjectRepository(CupMatch)
    private readonly cupMatchesRepository: Repository<CupMatch>,
    @InjectRepository(StandingsSyncLog)
    private readonly logsRepository: Repository<StandingsSyncLog>,
    private readonly settingsService: SettingsService,
    private readonly scraperService: FffScraperService,
    private readonly configService: ConfigService,
  ) {}

  /** The standings table itself never carries a logo — it's scraped from epreuves.fff.fr's
   * classement page (a different site from the pool/cup pages, blocked from this app's own
   * network, so its markup can't be re-verified to add logo scraping there too). Instead this
   * borrows each team's crest from whatever's already been scraped for pool_matches, matched
   * by normalized name — same list of clubs, already has the logos, no new scraping needed. */
  async findAll(): Promise<(TeamStanding & { logo: string | null })[]> {
    const [standings, logoByName] = await Promise.all([
      this.standingsRepository.find({ order: { rank: 'ASC' } }),
      this.buildLogoLookup(),
    ]);
    return standings.map((s) => ({ ...s, logo: logoByName.get(normalize(s.teamName)) ?? null }));
  }

  private async buildLogoLookup(): Promise<Map<string, string>> {
    const poolMatches = await this.poolMatchesRepository.find({
      select: { homeTeam: true, homeLogo: true, awayTeam: true, awayLogo: true },
    });
    const map = new Map<string, string>();
    for (const m of poolMatches) {
      if (m.homeLogo) map.set(normalize(m.homeTeam), m.homeLogo);
      if (m.awayLogo) map.set(normalize(m.awayTeam), m.awayLogo);
    }
    return map;
  }

  findAllPoolMatches(): Promise<PoolMatch[]> {
    return this.poolMatchesRepository.find({ order: { date: 'ASC' } });
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

  /** Scrapes every match of the poule, journée by journée (see
   * FffScraperService.scrapeChampionshipCalendar's own doc comment) and replaces what's
   * stored — no sync log of its own (unlike the standings table above): the local sync
   * script's own console output is what actually gets read when troubleshooting a run, same
   * as the calendar import next to it. */
  async syncPoolResults(): Promise<{ importedCount: number }> {
    const settings = await this.settingsService.get();
    if (!settings.fffChampionshipUrl) {
      throw new BadRequestException(
        "Aucune URL de championnat FFF configurée — renseigne-la dans Paramètres avant de synchroniser.",
      );
    }
    const scraped = await this.scraperService.scrapeChampionshipCalendar(settings.fffChampionshipUrl);
    return this.applyScrapedPoolMatches(scraped);
  }

  /** Applies pool results scraped elsewhere — the pool-match half of the same local-script
   * workaround as importScraped above. No network call to the district site happens here. */
  async importPoolResults(scraped: ScrapedPoolMatch[]): Promise<{ importedCount: number }> {
    return this.applyScrapedPoolMatches(scraped);
  }

  private async applyScrapedPoolMatches(scraped: ScrapedPoolMatch[]): Promise<{ importedCount: number }> {
    const clubName = this.configService.get<string>('CLUB_NAME', 'Ronchin');
    const normalizedClub = normalize(clubName);

    await this.poolMatchesRepository.clear();
    if (scraped.length > 0) {
      const entities = scraped.map((m) =>
        this.poolMatchesRepository.create({
          ...m,
          isUs: normalize(m.homeTeam).includes(normalizedClub) || normalize(m.awayTeam).includes(normalizedClub),
        }),
      );
      await this.poolMatchesRepository.save(entities);
    }
    return { importedCount: scraped.length };
  }

  findAllCupMatches(): Promise<CupMatch[]> {
    return this.cupMatchesRepository.find({ order: { date: 'ASC' } });
  }

  /** Scrapes the cup draw round by round (see FffScraperService.scrapeCupResults's own doc
   * comment — the next round doesn't exist on the site until it's drawn) and replaces what's
   * stored, same no-sync-log pattern as syncPoolResults above. */
  async syncCupResults(): Promise<{ importedCount: number }> {
    const settings = await this.settingsService.get();
    if (!settings.fffCupUrl) {
      throw new BadRequestException(
        "Aucune URL de coupe FFF configurée — renseigne-la dans Paramètres avant de synchroniser.",
      );
    }
    const scraped = await this.scraperService.scrapeCupResults(settings.fffCupUrl);
    return this.applyScrapedCupMatches(scraped);
  }

  /** Applies cup results scraped elsewhere — the cup-match half of the same local-script
   * workaround as importPoolResults above. */
  async importCupResults(scraped: ScrapedCupMatch[]): Promise<{ importedCount: number }> {
    return this.applyScrapedCupMatches(scraped);
  }

  private async applyScrapedCupMatches(scraped: ScrapedCupMatch[]): Promise<{ importedCount: number }> {
    const clubName = this.configService.get<string>('CLUB_NAME', 'Ronchin');
    const normalizedClub = normalize(clubName);

    await this.cupMatchesRepository.clear();
    if (scraped.length > 0) {
      const entities = scraped.map((m) =>
        this.cupMatchesRepository.create({
          ...m,
          isUs: normalize(m.homeTeam).includes(normalizedClub) || normalize(m.awayTeam).includes(normalizedClub),
        }),
      );
      await this.cupMatchesRepository.save(entities);
    }
    return { importedCount: scraped.length };
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
