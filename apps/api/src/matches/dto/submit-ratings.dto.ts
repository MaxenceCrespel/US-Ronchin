import { Type } from 'class-transformer';
import { IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { RATING_VALUES } from '../rating-values';

export class RatingEntryDto {
  @IsUUID()
  ratedUserId: string;

  @IsIn(RATING_VALUES)
  rating: number;
}

export class SubmitRatingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  ratings: RatingEntryDto[];
}
