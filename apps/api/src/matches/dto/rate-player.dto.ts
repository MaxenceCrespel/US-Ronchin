import { IsIn, IsUUID } from 'class-validator';
import { RATING_VALUES } from '../rating-values';

export class RatePlayerDto {
  @IsUUID()
  ratedUserId: string;

  @IsIn(RATING_VALUES)
  rating: number;
}
