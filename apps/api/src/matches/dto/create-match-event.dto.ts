import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { GoalType, MatchEventType } from '../entities/match-event.entity';

export class CreateMatchEventDto {
  @IsEnum(MatchEventType)
  type: MatchEventType;

  /** Exactly one of userId/scorerName must be set — enforced in MatchesService.addEvent,
   * not here, since it's a cross-field rule class-validator doesn't express cleanly. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scorerName?: string;

  @IsOptional()
  @IsUUID()
  assistUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  minute?: number;

  @IsOptional()
  @IsEnum(GoalType)
  goalType?: GoalType;
}
