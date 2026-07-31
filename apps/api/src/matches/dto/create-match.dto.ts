import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { MatchHomeAway, MatchSource } from '../entities/match.entity';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateMatchDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'kickOffTime doit être au format HH:mm' })
  kickOffTime?: string;

  @IsString()
  opponent: string;

  @IsEnum(MatchHomeAway)
  homeAway: MatchHomeAway;

  @IsOptional()
  @IsString()
  competition?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsEnum(MatchSource)
  source?: MatchSource;

  @IsOptional()
  @IsString()
  fffMatchId?: string;
}
