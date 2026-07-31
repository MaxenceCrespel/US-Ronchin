import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class RatingEntryDto {
  @IsUUID()
  ratedUserId: string;

  @IsInt()
  @Min(0)
  @Max(10)
  rating: number;
}

export class SubmitRatingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  ratings: RatingEntryDto[];
}
