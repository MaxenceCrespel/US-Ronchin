import { Injectable, Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import type { ScrapedMatch } from './scraped-match';
import type { ScrapedStanding } from './scraped-standing';
import type { ScrapedPoolMatch } from './scraped-pool-match';
import type { ScrapedCupMatch } from './scraped-cup-match';

chromium.use(StealthPlugin());

// The configured setting only needs to be the team's base page
// (".../equipe/{code}") — whatever tab the coach happened to copy the link from
// (/resultat-calendrier, /statistiques, /saison, /classement, or no suffix at all) is stripped
// back down to that base here, then the specific tab each scraper actually needs is appended,
// rather than requiring the coach to paste one exact URL shape.
function deriveBaseUrl(teamUrl: string): string | null {
  const match = /^(https?:\/\/.+\/equipe\/[^/]+)(?:\/.*)?$/.exec(teamUrl.replace(/\/$/, ''));
  return match ? match[1] : null;
}

function deriveMatchesUrl(teamUrl: string): string | null {
  const base = deriveBaseUrl(teamUrl);
  return base ? `${base}/resultat-calendrier` : null;
}

function deriveStandingsUrl(teamUrl: string): string | null {
  const base = deriveBaseUrl(teamUrl);
  return base ? `${base}/classement` : null;
}

// Real DOM structure confirmed by rendering an actual epreuves.fff.fr team
// page in a different environment where outbound access to the site wasn't
// blocked (it is blocked here — see the note on scrapeMatches below). Per
// match block, under `.matchs app-match-score`:
//   .schedule-match              -> "mer 05 aoû 2026" or "mer 12 aoû 2026 - 19h30"
//   .match-score-competition a   -> competition name (+ nested "Journée N")
//   .recevant .equipe-name       -> home team name
//   .visiteur .equipe-name       -> away team name
//   .recevant/.visiteur a.team[href] -> "/competition/club/{id}-slug/equipe/{code}"
//   .zone-score .score[href]     -> "/competition/match/{fffMatchId}-slug"
//   .zone-score .frame           -> "3 - 1" once played, " - " (no digits) otherwise
// A Didomi cookie-consent backdrop overlays the whole page on first load and
// silently absorbs every click (including the real "next month" button)
// until dismissed — confirmed via elementFromPoint at the button's
// coordinates. No venue/stadium field is exposed on this list view.
const MATCH_BLOCK_SELECTOR = '.matchs app-match-score';
const NEXT_BUTTON_SELECTOR = '.matchs .next-button';
const PREV_BUTTON_SELECTOR = '.matchs .prev-button';
const COOKIE_AGREE_SELECTOR = '#didomi-notice-agree-button';
// The page defaults to whichever month currently has matches to show — for a
// team past its last fixture that's the season's LAST month, with "next"
// already disabled. Forward-only pagination from there never reaches the
// rest of the season, so the calendar is scraped in both directions from the
// default position (confirmed live: default = "juin", prev enabled, next
// disabled — going forward alone misses the ~17 earlier matches entirely).
const MAX_MONTHS_TO_PAGINATE = 12;

// Angular's fr-FR abbreviated month names, as rendered by epreuves.fff.fr.
// Confirmed against a real page: the date line reads e.g. "dim 21 jun 2026 -
// 16h00" — a plain 3-letter abbreviation, not "juin". Matched by prefix (not
// fixed-length capture) so short and long forms both resolve; "jun"/"juin"
// and "jui"/"jul"/"juil" all map to the same month so there's no ambiguity
// even though several keys can match the same input.
const MONTH_PREFIXES: Record<string, number> = {
  jan: 1,
  janv: 1,
  fev: 2,
  fév: 2,
  fevr: 2,
  mar: 3,
  mars: 3,
  avr: 4,
  mai: 5,
  jun: 6,
  juin: 6,
  jui: 7,
  jul: 7,
  juil: 7,
  aou: 8,
  aoû: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  déc: 12,
};
const DATE_TEXT_PATTERN = /(\d{1,2})\s+([a-zéû]{3,9})\.?\s+(\d{4})(?:\s*-\s*(\d{1,2})h(\d{2}))?/i;

// Real DOM structure confirmed live against flandres.fff.fr (Coupe des Flandres Réserve,
// Seniors Réserve Niv1):
//   app-confrontation .confrontation  -> one match
//     .date                           -> "dimanche 18 octobre 2026 - 09H15"
//     .equipe1 / .equipe2             -> `.logo img[src]` (club crest, e.g.
//                                        ".../phlogos/BC501341.jpg") and `.name` -> "TEAM
//                                        NAME  3" — a team name AND a trailing number that is
//                                        NOT the score (confirmed on both pages, including via
//                                        a match's own detail page, where the exact same
//                                        number sits next to the team name while the page's
//                                        real score element, `.result-numbers`, is empty for
//                                        an unplayed match — this number is some other
//                                        per-team badge, unrelated to any single match). The
//                                        real score is `.score_match img.number[src]`, one
//                                        <img> per side in home-then-away order, filename
//                                        ".../origin/{digit}.png" — present only once a result
//                                        exists; both `.score_match` and this image are
//                                        structurally present on the cup page too (confirmed
//                                        via its match-detail page), it just hadn't shown a
//                                        played match yet when this was first built, which is
//                                        what led to the wrong assumption that the name's
//                                        trailing number was the cup's score.
//     ancestor <a href>               -> "/competitions?...&match_id=79686894"
// Championship (tab=calendar): `.results-content` wraps one journée each, `h3` holds "Journée
// N", lazy-loaded via infinite scroll (confirmed: 6 confrontations on first paint, stable at
// 90 across 18 journées only after repeated scrollTo(bottom)).
// Cup (tab=resultat): one round visible at a time, `.date_tour` holds its label (e.g. "1er
// tour"), `.text-center > a:first-child`/`:last-child` are the prev/next round arrows —
// `hidden` (not `disabled`) marks an end, e.g. both hidden when only the first round exists
// yet (confirmed live: this club's cup run had just started).
const CONFRONTATION_SELECTOR = 'app-confrontation .confrontation';
const JOURNEE_GROUP_SELECTOR = '.results-content';
const ROUND_LABEL_SELECTOR = '.date_tour';
const ROUND_PREV_SELECTOR = '.text-center > a:first-child';
const MAX_ROUNDS_TO_PAGINATE = 15;
const MAX_SCROLL_ATTEMPTS = 40;

function assertDistrictCompetitionUrl(url: string): void {
  if (!/^https:\/\/[a-z0-9-]+\.fff\.fr\/competitions\?/i.test(url)) {
    throw new Error(
      "URL de compétition FFF invalide — elle doit ressembler à https://<district>.fff.fr/competitions?id=....",
    );
  }
}

function withTab(configuredUrl: string, tab: string): string {
  const url = new URL(configuredUrl);
  url.searchParams.set('tab', tab);
  return url.toString();
}

interface RawConfrontation {
  dateText: string;
  homeText: string;
  awayText: string;
  homeLogoSrc: string | null;
  awayLogoSrc: string | null;
  matchHref: string | null;
  /** `.score_match img.number[src]`, split into home/away groups at the " - " text node
   * between them — see the big doc comment above CONFRONTATION_SELECTOR for why this, not the
   * `.name` text, is the real score. A score can be multi-digit (e.g. "10 - 1"): grouping by
   * that text-node split rather than assuming exactly one image per side is the fix for a real
   * bug confirmed live (Bondues 10-1 over Marquette, journée 2) — the old "exactly 2 images
   * total" assumption silently dropped it as unplayed since 3 digit images isn't 2. */
  scoreHomeDigitSrcs: string[];
  scoreAwayDigitSrcs: string[];
}

interface ParsedConfrontation {
  fffMatchId: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
}

interface RawMatchBlock {
  dateText: string;
  competitionText: string | null;
  homeName: string;
  awayName: string;
  homeHref: string;
  awayHref: string;
  matchHref: string | null;
  /** One entry per side (home, away), each holding that team's full score as text.
   * Empty array when the match hasn't been played yet. Real DOM:
   * `.zone-score .score` -> <span class="digit">2</span><span class="digit gagnant">4</span>
   * — no dash/separator text node between them, confirmed against a real played match. */
  scoreDigits: string[];
}

/**
 * Scrapes the public FFF "epreuves.fff.fr" team calendar page for a club's
 * upcoming and past matches.
 *
 * IMPORTANT — this could not be re-validated against the live page from
 * *this* environment: outbound requests to epreuves.fff.fr are blocked at
 * the network level here (403 on every request, confirmed with both plain
 * HTTP and a real headless browser). The selectors below are not a guess
 * though — they were captured by rendering a real team page in a different
 * environment where the site was reachable, while building the equivalent
 * feature for another club's app. If epreuves.fff.fr changes its markup
 * between now and whenever this runs somewhere unblocked, re-verify by
 * dumping `page.content()` for one real team page before trusting it blind.
 */
@Injectable()
export class FffScraperService {
  private readonly logger = new Logger(FffScraperService.name);

  async scrapeMatches(configuredUrl: string): Promise<ScrapedMatch[]> {
    const teamUrl = deriveMatchesUrl(configuredUrl);
    if (!teamUrl) {
      throw new Error(
        "Impossible d'extraire la page de l'équipe à partir de l'URL FFF configurée — " +
          "elle doit ressembler à https://epreuves.fff.fr/competition/club/{id}-{slug}/equipe/{code}.",
      );
    }
    // A real Chrome binary piloted by Playwright still got a hard 403 from
    // Incapsula even though the exact same URL loads fine in a manually
    // driven Chrome tab — that isolates the block to CDP-automation
    // detection specifically (Incapsula is known to fingerprint traces the
    // DevTools Protocol leaves, e.g. the `Runtime.enable` call Playwright
    // issues on every page). `playwright-extra` + puppeteer's stealth
    // plugin patches exactly those CDP-visible tells; plain JS property
    // overrides (navigator.webdriver etc.) were tried first and didn't
    // help, since they don't address the CDP-level leak.
    const browser = await chromium.launch({
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const page = await context.newPage();

      const response = await page.goto(teamUrl, { waitUntil: 'networkidle', timeout: 30000 });
      if (response && !response.ok()) {
        const headers = response.headers();
        const wafHint =
          headers['x-datadome'] !== undefined
            ? 'Datadome'
            : headers['cf-ray'] !== undefined || headers['cf-mitigated'] !== undefined
              ? 'Cloudflare'
              : headers['server'] === 'AkamaiGHost' || headers['x-akamai-transformed'] !== undefined
                ? 'Akamai'
                : 'inconnu';
        const bodySnippet = (await response.text().catch(() => '')).slice(0, 500);
        this.logger.error(
          `Blocage FFF — statut ${response.status()}, WAF détecté: ${wafHint}. ` +
            `Headers: ${JSON.stringify(headers)}. Body: ${bodySnippet}`,
        );
        throw new Error(
          `La page FFF a répondu avec le code ${response.status()} — probablement un blocage ` +
            `anti-bot (WAF: ${wafHint}) du serveur epreuves.fff.fr plutôt qu'un problème d'URL ou de saison. ` +
            'Détails dans les logs serveur pour diagnostic.',
        );
      }
      await page.waitForSelector('.matchs', { timeout: 15000 });
      await this.dismissCookieBanner(page);
      // The `.matchs` container mounts before Angular finishes hydrating the
      // match blocks inside it — reading immediately can race and see zero
      // blocks even on a month that has matches. Wait for the first block
      // (or give up after a beat if the month is genuinely empty).
      await page
        .waitForSelector(MATCH_BLOCK_SELECTOR, { timeout: 5000 })
        .catch(() => undefined);

      const myClubId = /\/club\/(\d+)-/.exec(teamUrl)?.[1] ?? null;
      const rawBlocks = await this.collectAllBlocks(page, teamUrl);

      const matches = new Map<string, ScrapedMatch>();
      for (const block of rawBlocks) {
        const match = this.parseBlock(block, myClubId);
        if (!match) continue;
        const key = match.fffMatchId ?? `${match.date}-${match.opponent}`;
        matches.set(key, match);
      }
      return [...matches.values()];
    } finally {
      await browser.close();
    }
  }

  /** Walks the same calendar widget as scrapeMatches, month by month both directions. `page`
   * must already be on `teamUrl` with the cookie banner dismissed, exactly scrapeMatches's own
   * state right before its old inline pagination loop (now this method, kept in case another
   * caller needs the per-team calendar again). */
  private async collectAllBlocks(page: Page, teamUrl: string): Promise<RawMatchBlock[]> {
    const blocksByKey = new Map<string, RawMatchBlock>();
    const collect = async () => {
      const blocks = await this.readMatchBlocks(page);
      for (const block of blocks) {
        const key = block.matchHref ?? `${block.dateText}-${block.homeName}-${block.awayName}`;
        blocksByKey.set(key, block);
      }
    };

    await collect();

    // Forward from the default position (covers upcoming fixtures if the
    // team is mid-season).
    for (let month = 0; month < MAX_MONTHS_TO_PAGINATE; month++) {
      const advanced = await this.goToNextMonth(page);
      if (!advanced) break;
      await page.waitForTimeout(1500);
      await collect();
    }

    // Back to the default position, then backward (covers the rest of the
    // season — see the note on MAX_MONTHS_TO_PAGINATE above).
    const response2 = await page.goto(teamUrl, { waitUntil: 'networkidle', timeout: 30000 });
    if (response2 && response2.ok()) {
      await page.waitForSelector('.matchs', { timeout: 15000 }).catch(() => undefined);
      await this.dismissCookieBanner(page);
      await page.waitForSelector(MATCH_BLOCK_SELECTOR, { timeout: 5000 }).catch(() => undefined);

      for (let month = 0; month < MAX_MONTHS_TO_PAGINATE; month++) {
        const advanced = await this.goToPreviousMonth(page);
        if (!advanced) break;
        await page.waitForTimeout(1500);
        await collect();
      }
    }

    return [...blocksByKey.values()];
  }

  /** Every match of the poule for the season, grouped by journée — straight from the
   * district's own competition page (see the big doc comment above CONFRONTATION_SELECTOR),
   * not derived from our own team's calendar. Own browser/page session, same setup as
   * scrapeMatches, so a failure or a slow run in one never affects the other. */
  async scrapeChampionshipCalendar(configuredUrl: string): Promise<ScrapedPoolMatch[]> {
    assertDistrictCompetitionUrl(configuredUrl);
    const url = withTab(configuredUrl, 'calendar');
    const browser = await chromium.launch({
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const page = await context.newPage();

      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      if (response && !response.ok()) {
        throw new Error(
          `La page du championnat a répondu avec le code ${response.status()} — probablement un blocage anti-bot.`,
        );
      }
      await this.dismissCookieBanner(page);
      await page.waitForSelector(CONFRONTATION_SELECTOR, { timeout: 15000 }).catch(() => undefined);

      // Journées lazy-load as the page scrolls ("infinitescroll") — keep scrolling to the
      // bottom until the confrontation count stops growing (confirmed live: 6 on first
      // paint, stable at 90 across a full 18-journée season only once fully scrolled).
      let lastCount = -1;
      for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
        const count = await page.locator(CONFRONTATION_SELECTOR).count();
        if (count === lastCount) break;
        lastCount = count;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      }

      const groups = await page.$$eval(JOURNEE_GROUP_SELECTOR, (sections) =>
        sections.map((section) => ({
          label: section.querySelector('h3')?.textContent?.trim() || null,
          confrontations: Array.from(section.querySelectorAll('app-confrontation .confrontation')).map(
            (block) => {
              const anchor = block.closest('a');
              // A score can be multi-digit ("10 - 1"): group the `.score_match img.number`
              // elements by which side of the " - " text node they fall on, rather than
              // assuming exactly one image per side.
              const scoreHomeDigitSrcs: string[] = [];
              const scoreAwayDigitSrcs: string[] = [];
              const scoreContainer = block.querySelector('.score_match');
              let side: 'home' | 'away' = 'home';
              for (const child of Array.from(scoreContainer?.childNodes ?? [])) {
                if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).matches('img.number')) {
                  (side === 'home' ? scoreHomeDigitSrcs : scoreAwayDigitSrcs).push(
                    (child as HTMLImageElement).src,
                  );
                } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes('-')) {
                  side = 'away';
                }
              }
              return {
                dateText: block.querySelector('.date')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
                homeText: block.querySelector('.equipe1 .name')?.textContent ?? '',
                awayText: block.querySelector('.equipe2 .name')?.textContent ?? '',
                homeLogoSrc: block.querySelector<HTMLImageElement>('.equipe1 .logo img')?.src ?? null,
                awayLogoSrc: block.querySelector<HTMLImageElement>('.equipe2 .logo img')?.src ?? null,
                matchHref: anchor?.getAttribute('href') ?? null,
                scoreHomeDigitSrcs,
                scoreAwayDigitSrcs,
              };
            },
          ),
        })),
      );

      const matches = new Map<string, ScrapedPoolMatch>();
      for (const group of groups) {
        for (const raw of group.confrontations) {
          const parsed = this.parseRawConfrontation(raw);
          if (!parsed) continue;
          const key = parsed.fffMatchId ?? `${parsed.date}-${parsed.homeTeam}-${parsed.awayTeam}`;
          matches.set(key, { ...parsed, matchday: group.label });
        }
      }
      return [...matches.values()];
    } finally {
      await browser.close();
    }
  }

  /** The cup's own elimination path, one round at a time — the next round doesn't exist on the
   * site until it's actually drawn, so this starts at whatever round is currently shown and
   * walks backward to "1er tour" rather than assuming a fixed number of rounds up front. */
  async scrapeCupResults(configuredUrl: string): Promise<ScrapedCupMatch[]> {
    assertDistrictCompetitionUrl(configuredUrl);
    const url = withTab(configuredUrl, 'resultat');
    const browser = await chromium.launch({
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const page = await context.newPage();

      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      if (response && !response.ok()) {
        throw new Error(
          `La page de la coupe a répondu avec le code ${response.status()} — probablement un blocage anti-bot.`,
        );
      }
      await this.dismissCookieBanner(page);
      await page.waitForSelector(CONFRONTATION_SELECTOR, { timeout: 15000 }).catch(() => undefined);

      const matches = new Map<string, ScrapedCupMatch>();
      const collectCurrentRound = async () => {
        const roundLabel =
          (await page.locator(ROUND_LABEL_SELECTOR).first().textContent().catch(() => null))?.trim() || 'Tour';
        const raws = await this.readConfrontations(page);
        for (const raw of raws) {
          const parsed = this.parseRawConfrontation(raw);
          if (!parsed) continue;
          const key = parsed.fffMatchId ?? `${roundLabel}-${parsed.date}-${parsed.homeTeam}-${parsed.awayTeam}`;
          matches.set(key, { ...parsed, round: roundLabel });
        }
      };

      await collectCurrentRound();
      for (let round = 0; round < MAX_ROUNDS_TO_PAGINATE; round++) {
        const moved = await this.goToPreviousRound(page);
        if (!moved) break;
        await page.waitForTimeout(1200);
        await collectCurrentRound();
      }

      return [...matches.values()];
    } finally {
      await browser.close();
    }
  }

  /**
   * The venue ("stade") — and the pitch surface alongside it — is never exposed on the
   * calendar list this file otherwise scrapes — confirmed live: `.schedule-match`/`.info-score`
   * blocks carry the date, teams, competition and score, nothing about where it's played. It
   * only shows up on each match's own detail page (".../competition/match/{id}-{slug}/match",
   * exactly `ScrapedMatch.matchDetailUrl`), and even there it isn't in the visible DOM text
   * either — Angular Universal serializes its API responses into a
   * `<script id="ng-state" type="application/json">` blob for hydration, and that's genuinely
   * the cleanest way to read it: `analog_GET|/api/data/matches/{id}` →
   * `body.donneesFormatees.stade` → `{ nom, adresse: string[], surface }` (all confirmed live
   * against a real Ronchin fixture — see the match this was built for:
   * https://epreuves.fff.fr/competition/match/79429367-o-hemois-u-s-ronchin/match). Called
   * lazily by FffSyncService, only for a match that doesn't already have a venue/surface —
   * every match needs its own full page load, and most matches keep the same venue and surface
   * all season, so this would otherwise re-scrape the same unchanging answer every week.
   */
  async scrapeVenue(matchDetailUrl: string): Promise<{ venue: string; surface: string | null } | null> {
    const browser = await chromium.launch({
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const page = await context.newPage();

      const response = await page.goto(matchDetailUrl, { waitUntil: 'networkidle', timeout: 30000 });
      if (!response || !response.ok()) return null;
      await this.dismissCookieBanner(page);
      await page.waitForTimeout(1500);

      const raw = await page.$eval('#ng-state', (el) => el.textContent ?? '').catch(() => null);
      if (!raw) return null;

      let state: Record<string, unknown>;
      try {
        state = JSON.parse(raw);
      } catch {
        return null;
      }

      const matchKey = Object.keys(state).find((k) => /^analog_GET\|\/api\/data\/matches\/\d+$/.test(k));
      if (!matchKey) return null;

      const stade = (state[matchKey] as any)?.body?.donneesFormatees?.stade as
        | { nom?: string; adresse?: string[]; surface?: string }
        | undefined;
      if (!stade?.nom) return null;

      // FFF stores this shouting-caps ("STADE GÉRARD DUBUS 1", "59510 HEM", "PELOUSE
      // SYNTHÉTIQUE") — title-case it so it reads like the rest of the app's text instead of
      // looking like an error state.
      const titleCase = (text: string) =>
        text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
      const name = titleCase(stade.nom);
      const address = (stade.adresse ?? []).map(titleCase).join(', ');
      return {
        venue: address ? `${name} — ${address}` : name,
        surface: stade.surface ? titleCase(stade.surface) : null,
      };
    } catch (error) {
      this.logger.warn(`Échec du scraping du lieu (${matchDetailUrl}): ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      await browser.close();
    }
  }

  /**
   * Scrapes the standings ("classement") table for the poule the configured team
   * plays in. The team calendar page links to it as "Voir le classement détaillé"
   * — confirmed real href: ".../equipe/{code}/classement" (same base path as the
   * team URL, last segment swapped). The page renders two <table> elements: a
   * compact 4-column widget (rank/team/pts/played) and the full 14-column one
   * (rank, "Pr." — unclear meaning, team, pts, played, won, drawn, lost, forfeits,
   * pén/bonus, goals for, goals against, diff, current streak) — picked by row
   * count since neither has a distinguishing class name.
   */
  async scrapeStandings(teamUrl: string): Promise<ScrapedStanding[]> {
    const standingsUrl = deriveStandingsUrl(teamUrl);
    if (!standingsUrl) {
      throw new Error(
        "Impossible de déduire l'URL du classement à partir de l'URL d'équipe configurée.",
      );
    }

    const browser = await chromium.launch({
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    try {
      const context = await browser.newContext({
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: {
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      const page = await context.newPage();

      const response = await page.goto(standingsUrl, { waitUntil: 'networkidle', timeout: 30000 });
      if (response && !response.ok()) {
        throw new Error(
          `La page de classement FFF a répondu avec le code ${response.status()} — probablement un blocage anti-bot.`,
        );
      }
      await this.dismissCookieBanner(page);
      await page.waitForTimeout(2000);

      const rows = await page.$$eval('table', (tables) => {
        const detailed =
          tables.find((t) => t.querySelectorAll('tbody tr').length > 5) ?? tables.at(-1);
        if (!detailed) return [] as string[][];
        return Array.from(detailed.querySelectorAll('tbody tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td')).map(
            (td) => td.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          ),
        );
      });

      const standings: ScrapedStanding[] = [];
      for (const cells of rows) {
        if (cells.length < 13) continue;
        const rank = Number(cells[0]);
        // Same stray per-team number seen (and confirmed meaningless there, see the big doc
        // comment on CONFRONTATION_SELECTOR) next to team names on the district competition
        // pages — this epreuves.fff.fr classement table's own name cell carries it too (e.g.
        // "BONDUES FC 5", observed in already-synced data; this specific page can't be
        // re-verified live, it's blocked from this app's own network). Left in, it broke the
        // logo lookup in StandingsService.findAll, which matches by normalized name against
        // pool_matches' clean team names.
        const teamName = cells[2]?.replace(/\s+\d+$/, '').trim() ?? '';
        if (!teamName || Number.isNaN(rank)) continue;

        standings.push({
          rank,
          teamName,
          points: Number(cells[3]) || 0,
          played: Number(cells[4]) || 0,
          won: Number(cells[5]) || 0,
          drawn: Number(cells[6]) || 0,
          lost: Number(cells[7]) || 0,
          goalsFor: Number(cells[10]) || 0,
          goalsAgainst: Number(cells[11]) || 0,
          goalDifference: Number(cells[12]) || 0,
        });
      }

      return standings.sort((a, b) => a.rank - b.rank);
    } finally {
      await browser.close();
    }
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    try {
      const button = await page.$(COOKIE_AGREE_SELECTOR);
      if (button) {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(500);
      }
    } catch {
      // Banner not present on this load — nothing to dismiss.
    }
  }

  /** The nav buttons render with a zero-size bounding box on this site (confirmed live: CSS
   * reports `visibility: visible`/`opacity: 1` but `getBoundingClientRect()` is all zeros —
   * likely the icon inside taking a beat to size itself under automation). Playwright's normal
   * `.click()` refuses to click something with an empty box and silently times out, which the
   * caller used to swallow (`.catch(() => undefined)`) — so every "next/previous month" click
   * was a no-op, and the whole forward/backward pagination loop below just re-read the site's
   * default month over and over instead of ever actually walking the calendar (this is why a
   * sync could leave every scraped match on the same date/month — not a date-parsing bug, a
   * navigation one). `force: true` skips Playwright's actionability checks (visibility/size/
   * stability) and clicks anyway; a raw in-page `el.click()` is the fallback if even that fails
   * for some other reason, since it bypasses Playwright's checks entirely. */
  private async clickNavButton(page: Page, selector: string): Promise<void> {
    const button = await page.$(selector);
    if (!button) return;
    try {
      await button.click({ timeout: 2000, force: true });
    } catch {
      await button.evaluate((el) => (el as HTMLButtonElement).click()).catch(() => undefined);
    }
  }

  private async goToNextMonth(page: Page): Promise<boolean> {
    const button = await page.$(NEXT_BUTTON_SELECTOR);
    if (!button) return false;

    const disabled = await button.evaluate((el) => (el as HTMLButtonElement).disabled).catch(() => true);
    if (disabled) return false;

    await this.clickNavButton(page, NEXT_BUTTON_SELECTOR);
    return true;
  }

  private async goToPreviousMonth(page: Page): Promise<boolean> {
    const button = await page.$(PREV_BUTTON_SELECTOR);
    if (!button) return false;

    const disabled = await button.evaluate((el) => (el as HTMLButtonElement).disabled).catch(() => true);
    if (disabled) return false;

    await this.clickNavButton(page, PREV_BUTTON_SELECTOR);
    return true;
  }

  private async readMatchBlocks(page: Page): Promise<RawMatchBlock[]> {
    return page.$$eval(MATCH_BLOCK_SELECTOR, (blocks) =>
      blocks.map((block) => {
        const homeEl = block.querySelector('.recevant');
        const awayEl = block.querySelector('.visiteur');
        const scoreLink = block.querySelector<HTMLAnchorElement>('.zone-score .score');

        return {
          dateText: block.querySelector('.schedule-match')?.textContent?.trim() ?? '',
          competitionText:
            block.querySelector('.match-score-competition a')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          homeName: homeEl?.querySelector('.equipe-name')?.textContent?.trim() ?? '',
          awayName: awayEl?.querySelector('.equipe-name')?.textContent?.trim() ?? '',
          homeHref: homeEl?.querySelector('a.team')?.getAttribute('href') ?? '',
          awayHref: awayEl?.querySelector('a.team')?.getAttribute('href') ?? '',
          matchHref: scoreLink?.getAttribute('href') ?? null,
          scoreDigits: Array.from(block.querySelectorAll('.zone-score .score .digit')).map(
            (el) => el.textContent?.trim() ?? '',
          ),
        };
      }),
    );
  }

  private parseBlock(block: RawMatchBlock, myClubId: string | null): ScrapedMatch | null {
    const dateMatch = this.parseDateText(block.dateText);
    if (!dateMatch) return null;

    const isHome = myClubId
      ? block.homeHref.includes(`/club/${myClubId}-`)
        ? true
        : block.awayHref.includes(`/club/${myClubId}-`)
          ? false
          : null
      : null;

    // Once pagination actually walks the calendar (see clickNavButton), this widget turns out
    // to list the WHOLE poule's fixtures for a given month, not just our team's — a block
    // where neither side is us is some other club's match entirely, not "our match, opponent
    // unknown". Silently guessing an opponent from it flooded the app with fixtures we're not
    // even part of (this is what the isHome === null fallback used to do here).
    if (isHome === null) return null;

    const opponent = isHome ? block.awayName : block.homeName;
    if (!opponent) return null;

    const fffMatchId = /\/competition\/match\/(\d+)/.exec(block.matchHref ?? '')?.[1] ?? null;
    const played =
      block.scoreDigits.length === 2 && block.scoreDigits.every((d) => /^\d+$/.test(d));

    // The two `.digit` spans are always in home-then-away order regardless of
    // which side "we" are, matching how Match stores scoreHome/scoreAway.
    const scoreHome = played ? Number(block.scoreDigits[0]) : null;
    const scoreAway = played ? Number(block.scoreDigits[1]) : null;

    return {
      fffMatchId,
      date: dateMatch.date,
      kickOffTime: dateMatch.time,
      opponent,
      homeAway: isHome === false ? 'AWAY' : 'HOME',
      venue: null,
      competition: block.competitionText ? block.competitionText.replace(/\s*Journ[ée]e\s*\d+\s*$/i, '').trim() : null,
      scoreHome,
      scoreAway,
      played,
      matchDetailUrl: block.matchHref ? `https://epreuves.fff.fr${block.matchHref}/match` : null,
      surface: null,
    };
  }

  private async readConfrontations(page: Page): Promise<RawConfrontation[]> {
    return page.$$eval(CONFRONTATION_SELECTOR, (blocks) =>
      blocks.map((block) => {
        const anchor = block.closest('a');
        const scoreHomeDigitSrcs: string[] = [];
        const scoreAwayDigitSrcs: string[] = [];
        const scoreContainer = block.querySelector('.score_match');
        let side: 'home' | 'away' = 'home';
        for (const child of Array.from(scoreContainer?.childNodes ?? [])) {
          if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).matches('img.number')) {
            (side === 'home' ? scoreHomeDigitSrcs : scoreAwayDigitSrcs).push((child as HTMLImageElement).src);
          } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes('-')) {
            side = 'away';
          }
        }
        return {
          dateText: block.querySelector('.date')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          homeText: block.querySelector('.equipe1 .name')?.textContent ?? '',
          awayText: block.querySelector('.equipe2 .name')?.textContent ?? '',
          homeLogoSrc: block.querySelector<HTMLImageElement>('.equipe1 .logo img')?.src ?? null,
          awayLogoSrc: block.querySelector<HTMLImageElement>('.equipe2 .logo img')?.src ?? null,
          matchHref: anchor?.getAttribute('href') ?? null,
          scoreHomeDigitSrcs,
          scoreAwayDigitSrcs,
        };
      }),
    );
  }

  /** Just the team name — the trailing number in this same text is NOT the score (see the big
   * doc comment above CONFRONTATION_SELECTOR) and is discarded entirely. */
  private parseConfrontationName(raw: string): string {
    const text = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const match = /^(.*\S)\s+\d+$/.exec(text);
    return match ? match[1] : text;
  }

  /** Shared by the championship-calendar and cup-results scrapers — both render the exact same
   * `.confrontation` markup, just grouped differently (journée vs round, added by the caller).
   * `played` requires both score images to resolve — a single one (a forfeit?) isn't a result
   * worth trusting either way. */
  private parseRawConfrontation(raw: RawConfrontation): ParsedConfrontation | null {
    const dateMatch = this.parseDateText(raw.dateText);
    if (!dateMatch) return null;
    const homeTeam = this.parseConfrontationName(raw.homeText);
    const awayTeam = this.parseConfrontationName(raw.awayText);
    if (!homeTeam || !awayTeam) return null;

    // Each side's digit images concatenate into a (possibly multi-digit) number — "10 - 1"
    // renders as two <img> on the home side, one on the away side, not one each.
    const parseDigits = (srcs: string[]): number | null => {
      if (srcs.length === 0) return null;
      const digits = srcs.map((src) => /origin\/(\d+)\.png/.exec(src)?.[1]);
      if (digits.some((d) => d === undefined)) return null;
      return Number(digits.join(''));
    };
    const scoreHome = parseDigits(raw.scoreHomeDigitSrcs);
    const scoreAway = parseDigits(raw.scoreAwayDigitSrcs);
    const played = scoreHome !== null && scoreAway !== null;
    const fffMatchId = /match_id=(\d+)/.exec(raw.matchHref ?? '')?.[1] ?? null;

    return {
      fffMatchId,
      date: dateMatch.date,
      homeTeam,
      awayTeam,
      homeLogo: raw.homeLogoSrc,
      awayLogo: raw.awayLogoSrc,
      scoreHome: played ? scoreHome : null,
      scoreAway: played ? scoreAway : null,
      played,
    };
  }

  private async goToPreviousRound(page: Page): Promise<boolean> {
    const button = await page.$(ROUND_PREV_SELECTOR);
    if (!button) return false;

    const hidden = await button.evaluate((el) => el.hasAttribute('hidden')).catch(() => true);
    if (hidden) return false;

    await this.clickNavButton(page, ROUND_PREV_SELECTOR);
    return true;
  }

  private parseDateText(text: string): { date: string; time: string | null } | null {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, ''); // strip accents (août -> aout, décembre -> decembre)

    const match = DATE_TEXT_PATTERN.exec(normalized);
    if (!match) return null;

    const [, day, monthText, year, hour, minute] = match;
    const monthKey = Object.keys(MONTH_PREFIXES).find((prefix) => monthText.startsWith(prefix));
    if (!monthKey) return null;

    const month = MONTH_PREFIXES[monthKey];
    const date = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
    const time = hour ? `${hour.padStart(2, '0')}:${minute}` : null;

    return { date, time };
  }
}
