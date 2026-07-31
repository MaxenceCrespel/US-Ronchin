export interface ParsedPlayerLine {
  jerseyNumber: number | null;
  name: string;
  licenseNumber: string;
  isCaptain: boolean;
  isStarter: boolean;
  participated: boolean;
}

export interface ParsedGoal {
  teamName: string;
  licenseNumber: string;
  jerseyNumber: number | null;
  playerName: string;
  goalType: string;
  actionPrecedente: string;
  passeurName: string | null;
  minute: number | null;
}

export interface ParsedCard {
  teamName: string;
  licenseNumber: string;
  jerseyNumber: number | null;
  playerName: string;
  motif: string;
  cardType: 'YELLOW_CARD' | 'RED_CARD';
  needsReview: boolean;
  minute: number | null;
}

export interface ParsedMatchHeader {
  fffMatchId: string | null;
  date: string | null;
  kickOffTime: string | null;
  competition: string | null;
  venue: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface ParsedMatchSheet {
  header: ParsedMatchHeader;
  homeComposition: ParsedPlayerLine[];
  awayComposition: ParsedPlayerLine[];
  goals: ParsedGoal[];
  cards: ParsedCard[];
}
