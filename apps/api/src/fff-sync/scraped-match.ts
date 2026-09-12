export interface ScrapedMatch {
  fffMatchId: string | null;
  date: string; // ISO yyyy-mm-dd
  kickOffTime: string | null;
  opponent: string;
  homeAway: 'HOME' | 'AWAY';
  venue: string | null;
  competition: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
  /** The match's own detail page — the calendar list this all comes from never exposes the
   * venue itself (see FffScraperService.scrapeVenue), so this is kept around for the sync
   * service to fetch it lazily, only for matches that don't already have one. */
  matchDetailUrl: string | null;
}
