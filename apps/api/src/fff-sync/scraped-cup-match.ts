export interface ScrapedCupMatch {
  fffMatchId: string | null;
  date: string; // ISO yyyy-mm-dd
  round: string; // e.g. "1er tour", straight from the district site's own round label
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
}
