import { IsOptional, IsUUID } from 'class-validator';

export class VoteDefenseBossDto {
  /** Omitted entirely for a "vote blanc" — a deliberate abstention, counted toward turnout
   * but never toward anyone's tally. See MatchesService.voteDefenseBoss. */
  @IsOptional()
  @IsUUID()
  votedForId?: string;
}
