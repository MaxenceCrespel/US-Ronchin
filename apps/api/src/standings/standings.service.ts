import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TeamStanding } from './entities/team-standing.entity';
import { PoolMatch } from './entities/pool-match.entity';
import { CupMatch } from './entities/cup-match.entity';
import { StandingsSyncLog, StandingsSyncStatus } from './entities/standings-sync-log.entity';
import { Match } from '../matches/entities/match.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SettingsService } from '../settings/settings.service';
import { FffScraperService } from '../fff-sync/fff-scraper.service';
import { normalize, teamNameMatches } from '../pdf-import/player-matching';
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
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly settingsService: SettingsService,
    private readonly scraperService: FffScraperService,
    private readonly configService: ConfigService,
    private readonly pushNotificationsService: PushNotificationsService,
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

  /** Lets the frontend link a pool-match row straight to its own match-detail page — only
   * meaningful for our own matches (isUs), since a pool match between two other clubs has no
   * fiche of ours to point to. Joined on the FFF match id (both now come from epreuves.fff.fr);
   * rows imported from the old district pages had another id scheme, so those still fall back
   * to date + opponent name, with the same fuzzy teamNameMatches() used for guest/player
   * matching (a trailing squad number may be on one side only). */
  async findAllPoolMatches(): Promise<(PoolMatch & { matchId: string | null })[]> {
    const matches = await this.poolMatchesRepository.find({ order: { date: 'ASC' } });
    return this.enrichWithMatchId(matches);
  }

  private async enrichWithMatchId<
    T extends { fffMatchId: string | null; date: string; homeTeam: string; awayTeam: string; isUs: boolean },
  >(
    rows: T[],
  ): Promise<(T & { matchId: string | null })[]> {
    if (!rows.some((r) => r.isUs)) return rows.map((r) => ({ ...r, matchId: null }));

    const clubName = this.configService.get<string>('CLUB_NAME', 'Ronchin');
    const normalizedClub = normalize(clubName);
    const ourMatches = await this.matchesRepository.find({
      select: { id: true, fffMatchId: true, date: true, opponent: true },
    });

    return rows.map((r) => {
      if (!r.isUs) return { ...r, matchId: null };
      const opponentName = normalize(r.homeTeam).includes(normalizedClub) ? r.awayTeam : r.homeTeam;
      const match =
        (r.fffMatchId ? ourMatches.find((m) => m.fffMatchId === r.fffMatchId) : undefined) ??
        ourMatches.find((m) => m.date === r.date && teamNameMatches(m.opponent, opponentName));
      return { ...r, matchId: match?.id ?? null };
    });
  }

  /** Scrapes epreuves.fff.fr itself and applies the result — see FffSyncService.sync's own
   * doc comment for why this is expected to fail from the production server specifically
   * (blocked by the site's WAF) and why `importScraped` exists as the path that's actually
   * used there. */
  async sync(triggeredBy: string | null = null): Promise<StandingsSyncLog> {
    const settings = await this.settingsService.get();
    if (!settings.fffChampionshipUrl && !settings.fffTeamUrl) {
      throw new BadRequestException(
        "Aucune URL FFF configurée — renseigne le lien du championnat dans Paramètres avant de synchroniser.",
      );
    }

    try {
      // The championship page carries the standings itself; the team page is the older source.
      const scraped = settings.fffChampionshipUrl
        ? (await this.scraperService.scrapeChampionship(settings.fffChampionshipUrl)).standings
        : await this.scraperService.scrapeStandings(settings.fffTeamUrl!);
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

    // An empty scrape almost never means the real standings are now empty — far more likely
    // the page didn't load, the WAF blocked this run, or the layout changed. Clearing the
    // table unconditionally wiped every row on exactly that kind of transient failure (the
    // district site returning nothing once is not as rare as "the poule now has 0 teams").
    if (scraped.length > 0) {
      await this.standingsRepository.clear();
      const entities = scraped.map((s) =>
        this.standingsRepository.create({
          ...s,
          isUs: normalize(s.teamName).includes(normalizedClub),
        }),
      );
      await this.standingsRepository.save(entities);
    } else {
      this.logger.warn('Scraping du classement : 0 équipe trouvée — table laissée inchangée');
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

    // Same guard as applyScraped above, for the same reason — an empty scrape wiped all 90
    // pool matches in production on 2026-10-14 after a run that found nothing (the site's own
    // infinite-scroll pagination likely didn't load in time), with nothing left to re-import
    // until the next successful run. Leave existing matches alone instead.
    if (scraped.length > 0) {
      await this.poolMatchesRepository.clear();
      const entities = scraped.map((m) =>
        this.poolMatchesRepository.create({
          ...m,
          isUs: normalize(m.homeTeam).includes(normalizedClub) || normalize(m.awayTeam).includes(normalizedClub),
        }),
      );
      await this.poolMatchesRepository.save(entities);
    } else {
      this.logger.warn('Scraping des résultats de poule : 0 match trouvé — table laissée inchangée');
    }
    return { importedCount: scraped.length };
  }

  /** Same linking as findAllPoolMatches — see its own doc comment. */
  async findAllCupMatches(): Promise<(CupMatch & { matchId: string | null })[]> {
    const matches = await this.cupMatchesRepository.find({ order: { date: 'ASC' } });
    return this.enrichWithMatchId(matches);
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

    // Same guard as applyScraped/applyScrapedPoolMatches above — don't wipe a real cup draw
    // over a transient empty scrape.
    if (scraped.length > 0) {
      const previous = await this.cupMatchesRepository.find({ select: { round: true, isUs: true } });
      await this.cupMatchesRepository.clear();
      const entities = scraped.map((m) =>
        this.cupMatchesRepository.create({
          ...m,
          isUs: normalize(m.homeTeam).includes(normalizedClub) || normalize(m.awayTeam).includes(normalizedClub),
        }),
      );
      await this.cupMatchesRepository.save(entities);
      await this.notifyNewCupRounds(previous, entities, normalizedClub).catch((error) =>
        this.logger.error('Échec de la notification du nouveau tour de coupe', error),
      );
    } else {
      this.logger.warn('Scraping du parcours en coupe : 0 match trouvé — table laissée inchangée');
    }
    return { importedCount: scraped.length };
  }

  /** Tells the squad as soon as one of our cup matches shows up in a round we didn't have yet
   * (the draw for the next round is out). Skipped on the very first import, when every round
   * would look new. */
  private async notifyNewCupRounds(
    previous: Pick<CupMatch, 'round' | 'isUs'>[],
    current: CupMatch[],
    normalizedClub: string,
  ): Promise<void> {
    if (previous.length === 0) return;
    const knownRounds = new Set(previous.filter((m) => m.isUs).map((m) => m.round));
    const drawn = current.filter((m) => m.isUs && !knownRounds.has(m.round));
    if (drawn.length === 0) return;

    const roster = await this.usersRepository.find({
      select: { id: true },
      where: [
        { role: UserRole.PLAYER, status: UserStatus.ACTIVE },
        { role: UserRole.COACH, status: UserStatus.ACTIVE },
        { role: UserRole.SUPERADMIN, status: UserStatus.ACTIVE },
        { isPlayingCoach: true, status: UserStatus.ACTIVE },
      ],
    });
    const targets = [...new Set(roster.map((u) => u.id))];
    if (targets.length === 0) return;

    for (const cupMatch of drawn) {
      const home = normalize(cupMatch.homeTeam).includes(normalizedClub);
      const opponent = home ? cupMatch.awayTeam : cupMatch.homeTeam;
      const day = new Date(`${cupMatch.date}T12:00:00Z`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Europe/Paris',
      });
      const ours = cupMatch.fffMatchId
        ? await this.matchesRepository.findOne({ select: { id: true }, where: { fffMatchId: cupMatch.fffMatchId } })
        : null;
      await this.pushNotificationsService.sendToUsers(targets, {
        title: `Coupe : ${cupMatch.round}`,
        body: `Tirage connu : ${home ? 'on reçoit' : 'on va chez'} ${opponent} le ${day}.`,
        url: ours ? `/matches/${ours.id}` : '/coupe',
      });
    }
  }

  /** A failure reported by the local sync script (see StandingsController.reportSyncFailure). */
  recordSyncFailure(errorMessage: string): Promise<StandingsSyncLog> {
    return this.logError(new Error(`Synchro locale : ${errorMessage}`), null);
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
