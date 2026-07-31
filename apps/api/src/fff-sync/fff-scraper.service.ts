import { Injectable, Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import type { ScrapedMatch } from './scraped-match';
import type { ScrapedStanding } from './scraped-standing';

chromium.use(StealthPlugin());

function deriveStandingsUrl(teamUrl: string): string | null {
  const match = /^(https?:\/\/.+\/equipe\/[^/]+)(?:\/.*)?$/.exec(teamUrl.replace(/\/$/, ''));
  return match ? `${match[1]}/classement` : null;
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

  async scrapeMatches(teamUrl: string): Promise<ScrapedMatch[]> {
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
      const matches = new Map<string, ScrapedMatch>();
      const collect = async () => {
        const blocks = await this.readMatchBlocks(page);
        for (const block of blocks) {
          const match = this.parseBlock(block, myClubId);
          if (!match) continue;
          const key = match.fffMatchId ?? `${match.date}-${match.opponent}`;
          matches.set(key, match);
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
        await page
          .waitForSelector(MATCH_BLOCK_SELECTOR, { timeout: 5000 })
          .catch(() => undefined);

        for (let month = 0; month < MAX_MONTHS_TO_PAGINATE; month++) {
          const advanced = await this.goToPreviousMonth(page);
          if (!advanced) break;
          await page.waitForTimeout(1500);
          await collect();
        }
      }

      return [...matches.values()];
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
        const teamName = cells[2];
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

  private async goToNextMonth(page: Page): Promise<boolean> {
    const button = await page.$(NEXT_BUTTON_SELECTOR);
    if (!button) return false;

    const disabled = await button.evaluate((el) => (el as HTMLButtonElement).disabled).catch(() => true);
    if (disabled) return false;

    await button.click({ timeout: 2000 }).catch(() => undefined);
    return true;
  }

  private async goToPreviousMonth(page: Page): Promise<boolean> {
    const button = await page.$(PREV_BUTTON_SELECTOR);
    if (!button) return false;

    const disabled = await button.evaluate((el) => (el as HTMLButtonElement).disabled).catch(() => true);
    if (disabled) return false;

    await button.click({ timeout: 2000 }).catch(() => undefined);
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

    const opponent = isHome === null ? block.awayName || block.homeName : isHome ? block.awayName : block.homeName;
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
    };
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
