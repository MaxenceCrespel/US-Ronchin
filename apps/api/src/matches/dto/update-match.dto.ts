import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CreateMatchDto } from './create-match.dto';
import { MatchStatus } from '../entities/match.entity';

export class UpdateMatchDto extends PartialType(CreateMatchDto) {
  @IsOptional()
  @IsInt()
  @Min(0)
  scoreHome?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreAway?: number;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  /** Set once, when the coach clicks "Terminer" at the end of the composition/events setup
   * wizard — only true unlocks voting (see MatchesService.update). Distinct from status
   * PLAYED, which flips as soon as just the score is saved (a separate, earlier step),
   * long before events (scorers/cards) exist. */
  @IsOptional()
  @IsBoolean()
  resultConfirmed?: boolean;
}
