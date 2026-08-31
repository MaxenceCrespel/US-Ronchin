import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TrainingType } from '../entities/training.entity';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateTrainingDto {
  @IsString()
  title: string;

  @IsEnum(TrainingType)
  type: TrainingType;

  @IsString()
  location: string;

  @ValidateIf((dto) => dto.type === TrainingType.RECURRING)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** Caps confirmed PRESENT responses (e.g. 16 for a locked 8v8) — omit/null for no cap. */
  @IsOptional()
  @IsInt()
  @Min(2)
  maxPresentPlayers?: number | null;
}
