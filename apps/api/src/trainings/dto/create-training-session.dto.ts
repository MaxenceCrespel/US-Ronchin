import { IsDateString, IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateTrainingSessionDto {
  @IsDateString()
  date: string;

  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime: string;

  @IsString()
  location: string;
}
