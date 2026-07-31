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
}
