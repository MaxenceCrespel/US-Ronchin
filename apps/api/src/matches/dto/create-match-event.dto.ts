import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { GoalType, MatchEventType } from '../entities/match-event.entity';

export class CreateMatchEventDto {
  @IsEnum(MatchEventType)
  type: MatchEventType;

  @IsUUID()
  userId: string;

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
