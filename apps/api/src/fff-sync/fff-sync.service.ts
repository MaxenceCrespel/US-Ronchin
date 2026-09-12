import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, MatchSource } from '../matches/entities/match.entity';
import { FffSyncLog, FffSyncStatus } from './entities/fff-sync-log.entity';
import { SettingsService } from '../settings/settings.service';
import { FffScraperService } from './fff-scraper.service';
import type { ScrapedMatch } from './scraped-match';

@Injectable()
export class FffSyncService {
  private readonly logger = new Logger(FffSyncService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(FffSyncLog)
    private readonly logsRepository: Repository<FffSyncLog>,
    private readonly settingsService: SettingsService,
    private readonly scraperService: FffScraperService,
  ) {}

  /** Scrapes epreuves.fff.fr itself and applies the result — works from a machine
   * epreuves.fff.fr's WAF doesn't block (confirmed blocked from both the production VPS and
   * GitHub Actions runners; both are treated as datacenter IPs). Kept around for local/manual
   * use and in case that ever changes (a proxy, a different host); production relies on
   * `importScraped` instead — see its own doc comment. */
  async sync(triggeredBy: string | null = null): Promise<FffSyncLog> {
    const settings = await this.settingsService.get();
    if (!settings.fffTeamUrl) {
      throw new BadRequestException(
        "Aucune URL d'équipe FFF configurée — renseigne-la dans Paramètres avant de synchroniser.",
      );
    }

    try {
      const scrapedMatches = await this.scraperService.scrapeMatches(settings.fffTeamUrl);
      const resolved = await this.resolveVenues(scrapedMatches);
      const { created, updated } = await this.applyScrapedMatches(resolved, triggeredBy);
      return this.logsRepository.save(
        this.logsRepository.create({
          status: FffSyncStatus.SUCCESS,
          matchesFound: scrapedMatches.length,
          matchesCreated: created,
          matchesUpdated: updated,
          errorMessage: null,
          triggeredBy,
        }),
      );
    } catch (error) {
      this.logger.error('Échec de la synchronisation FFF', error);
      return this.logsRepository.save(
        this.logsRepository.create({
          status: FffSyncStatus.ERROR,
          matchesFound: 0,
          matchesCreated: 0,
          matchesUpdated: 0,
          errorMessage: error instanceof Error ? error.message : String(error),
          triggeredBy,
        }),
      );
    }
  }

  /** Applies matches scraped elsewhere — the local sync script (scripts/local-fff-sync.js)
   * runs the exact same scraping code as `sync()` above, but from the coach's own machine,
   * whose IP epreuves.fff.fr doesn't block, then POSTs the fully-resolved result (venue and
   * surface already looked up) here. No network call to epreuves.fff.fr happens on this path
   * at all — this is pure persistence, identical to what `sync()` does with its own scrape
   * result once resolved. */
  async importScraped(scrapedMatches: ScrapedMatch[], triggeredBy: string | null = null): Promise<FffSyncLog> {
    try {
      const { created, updated } = await this.applyScrapedMatches(scrapedMatches, triggeredBy);
      return this.logsRepository.save(
        this.logsRepository.create({
          status: FffSyncStatus.SUCCESS,
          matchesFound: scrapedMatches.length,
          matchesCreated: created,
          matchesUpdated: updated,
          errorMessage: null,
          triggeredBy,
        }),
      );
    } catch (error) {
      this.logger.error("Échec de l'import FFF", error);
      return this.logsRepository.save(
        this.logsRepository.create({
          status: FffSyncStatus.ERROR,
          matchesFound: 0,
          matchesCreated: 0,
          matchesUpdated: 0,
          errorMessage: error instanceof Error ? error.message : String(error),
          triggeredBy,
        }),
      );
    }
  }

  /** Fills in venue/surface for a freshly-scraped batch, the same lazy way `sync()` always
   * has: only worth an extra page load (scrapeVenue) the first time a match — new or already
   * in the DB — doesn't have one yet, never on a resync of a venue that won't have changed. */
  private async resolveVenues(scrapedMatches: ScrapedMatch[]): Promise<ScrapedMatch[]> {
    const resolved: ScrapedMatch[] = [];
    for (const scraped of scrapedMatches) {
      const existing = await this.findExisting(scraped);
      const needsVenue = !(scraped.venue ?? existing?.venue) || !(scraped.surface ?? existing?.surface);
      if (needsVenue && scraped.matchDetailUrl) {
        const detail = await this.scraperService.scrapeVenue(scraped.matchDetailUrl);
        resolved.push({
          ...scraped,
          venue: detail?.venue ?? scraped.venue ?? existing?.venue ?? null,
          surface: detail?.surface ?? scraped.surface ?? existing?.surface ?? null,
        });
      } else {
        resolved.push({
          ...scraped,
          venue: scraped.venue ?? existing?.venue ?? null,
          surface: scraped.surface ?? existing?.surface ?? null,
        });
      }
    }
    return resolved;
  }

  private findExisting(scraped: Pick<ScrapedMatch, 'fffMatchId' | 'date' | 'opponent'>): Promise<Match | null> {
    return scraped.fffMatchId
      ? this.matchesRepository.findOne({ where: { fffMatchId: scraped.fffMatchId } })
      : this.matchesRepository.findOne({
          where: { source: MatchSource.OFFICIAL_FFF, date: scraped.date, opponent: scraped.opponent },
        });
  }

  private async applyScrapedMatches(
    scrapedMatches: ScrapedMatch[],
    triggeredBy: string | null,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const scraped of scrapedMatches) {
      const existing = await this.findExisting(scraped);

      if (existing) {
        existing.date = scraped.date;
        existing.kickOffTime = scraped.kickOffTime;
        existing.opponent = scraped.opponent;
        existing.homeAway = scraped.homeAway as Match['homeAway'];
        existing.competition = scraped.competition ?? existing.competition;
        existing.venue = scraped.venue ?? existing.venue;
        existing.surface = scraped.surface ?? existing.surface;
        if (scraped.played) {
          existing.scoreHome = scraped.scoreHome;
          existing.scoreAway = scraped.scoreAway;
          existing.status = 'PLAYED' as Match['status'];
        }
        await this.matchesRepository.save(existing);
        updated += 1;
      } else {
        const match = this.matchesRepository.create({
          source: MatchSource.OFFICIAL_FFF,
          fffMatchId: scraped.fffMatchId,
          date: scraped.date,
          kickOffTime: scraped.kickOffTime,
          opponent: scraped.opponent,
          homeAway: scraped.homeAway as Match['homeAway'],
          venue: scraped.venue,
          surface: scraped.surface,
          competition: scraped.competition,
          scoreHome: scraped.played ? scraped.scoreHome : null,
          scoreAway: scraped.played ? scraped.scoreAway : null,
          status: scraped.played ? ('PLAYED' as Match['status']) : undefined,
          createdBy: triggeredBy,
        });
        await this.matchesRepository.save(match);
        created += 1;
      }
    }

    return { created, updated };
  }

  getRecentLogs(limit: number): Promise<FffSyncLog[]> {
    return this.logsRepository.find({ order: { runAt: 'DESC' }, take: limit });
  }

  /** What the local sync script checks before re-fetching a match's detail page — only the
   * fields it actually needs to decide "do I already know this one's venue/surface?". */
  async getExistingSummaries(): Promise<
    { fffMatchId: string | null; date: string; opponent: string; venue: string | null; surface: string | null }[]
  > {
    const matches = await this.matchesRepository.find({
      where: { source: MatchSource.OFFICIAL_FFF },
      select: { fffMatchId: true, date: true, opponent: true, venue: true, surface: true },
    });
    return matches;
  }
}
