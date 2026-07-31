import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, MatchSource } from '../matches/entities/match.entity';
import { FffSyncLog, FffSyncStatus } from './entities/fff-sync-log.entity';
import { SettingsService } from '../settings/settings.service';
import { FffScraperService } from './fff-scraper.service';

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

  async sync(triggeredBy: string | null = null): Promise<FffSyncLog> {
    const settings = await this.settingsService.get();
    if (!settings.fffTeamUrl) {
      throw new BadRequestException(
        "Aucune URL d'équipe FFF configurée — renseigne-la dans Paramètres avant de synchroniser.",
      );
    }

    try {
      const scrapedMatches = await this.scraperService.scrapeMatches(settings.fffTeamUrl);

      let created = 0;
      let updated = 0;

      for (const scraped of scrapedMatches) {
        const existing = scraped.fffMatchId
          ? await this.matchesRepository.findOne({
              where: { fffMatchId: scraped.fffMatchId },
            })
          : await this.matchesRepository.findOne({
              where: {
                source: MatchSource.OFFICIAL_FFF,
                date: scraped.date,
                opponent: scraped.opponent,
              },
            });

        if (existing) {
          existing.date = scraped.date;
          existing.kickOffTime = scraped.kickOffTime;
          existing.opponent = scraped.opponent;
          existing.homeAway = scraped.homeAway as Match['homeAway'];
          existing.venue = scraped.venue ?? existing.venue;
          existing.competition = scraped.competition ?? existing.competition;
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

      const log = this.logsRepository.create({
        status: FffSyncStatus.SUCCESS,
        matchesFound: scrapedMatches.length,
        matchesCreated: created,
        matchesUpdated: updated,
        errorMessage: null,
        triggeredBy,
      });
      return this.logsRepository.save(log);
    } catch (error) {
      this.logger.error('Échec de la synchronisation FFF', error);
      const log = this.logsRepository.create({
        status: FffSyncStatus.ERROR,
        matchesFound: 0,
        matchesCreated: 0,
        matchesUpdated: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
        triggeredBy,
      });
      return this.logsRepository.save(log);
    }
  }

  getRecentLogs(limit: number): Promise<FffSyncLog[]> {
    return this.logsRepository.find({ order: { runAt: 'DESC' }, take: limit });
  }
}
