import type { MatchHomeAway } from '../../matches/entities/match.entity';
import type { GoalType } from '../../matches/entities/match-event.entity';

export interface ParsedMatchInfoResponse {
  fffMatchId: string | null;
  date: string | null;
  kickOffTime: string | null;
  competition: string | null;
  venue: string | null;
  opponent: string | null;
  homeAway: MatchHomeAway;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface ParsedCompositionEntryResponse {
  pdfName: string;
  licenseNumber: string;
  jerseyNumber: number | null;
  isStarter: boolean;
  matchedUserId: string | null;
}

export interface ParsedGoalResponse {
  minute: number | null;
  playerPdfName: string;
  matchedUserId: string | null;
  assistPdfName: string | null;
  assistMatchedUserId: string | null;
  goalType: GoalType | null;
}

export interface ParsedCardResponse {
  minute: number | null;
  playerPdfName: string;
  matchedUserId: string | null;
  type: 'YELLOW_CARD' | 'RED_CARD';
  needsReview: boolean;
}

export interface ParsedMatchSheetResponse {
  matchInfo: ParsedMatchInfoResponse;
  composition: ParsedCompositionEntryResponse[];
  goals: ParsedGoalResponse[];
  cards: ParsedCardResponse[];
}
