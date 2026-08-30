import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { RATING_VALUES } from '../rating-values';

export class RatingEntryDto {
  // Exactly one of ratedUserId/ratedGuestId is required — enforced in
  // MatchesService.submitRatings, same split as linking guests for MOTM/patron de la
  // défense votes. A guest (no account yet) is targeted by their composition entry id.
  @IsOptional()
  @IsUUID()
  ratedUserId?: string;

  @IsOptional()
  @IsUUID()
  ratedGuestId?: string;

  @IsIn(RATING_VALUES)
  rating: number;
}

export class SubmitRatingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  ratings: RatingEntryDto[];
}
