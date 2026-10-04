export interface ScrapedMatch {
  fffMatchId: string | null;
  date: string; // ISO yyyy-mm-dd
  kickOffTime: string | null;
  opponent: string;
  homeAway: 'HOME' | 'AWAY';
  /** Home then away, same CDN as the district pages' crests (see parseBlock's own comment for
   * why this isn't actually scraped from an <img> here). */
  homeLogo: string | null;
  awayLogo: string | null;
  venue: string | null;
  competition: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
  /** The match's own detail page — the calendar list this all comes from never exposes the
   * venue itself (see FffScraperService.scrapeVenue), so this is kept around for the sync
   * service to fetch it lazily, only for matches that don't already have one. */
  matchDetailUrl: string | null;
  /** e.g. "Pelouse Naturelle"/"Synthétique" — like venue, this only ever comes from
   * scrapeVenue, resolved lazily; null until (if ever) that lookup happens. */
  surface: string | null;
}
