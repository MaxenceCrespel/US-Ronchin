export interface ScrapedPoolMatch {
  fffMatchId: string | null;
  date: string; // ISO yyyy-mm-dd
  matchday: string | null; // e.g. "Journée 5", from the competition text
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
}
