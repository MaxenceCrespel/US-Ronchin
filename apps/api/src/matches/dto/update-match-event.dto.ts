import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Minute only — added after the fact from the events list (see MatchesService.updateEvent).
 * Everything else about an event (type, scorer, assist) is fixed at creation; only the minute
 * is meant to be optional up front and fillable in later, since asking for it immediately
 * used to force the coach to know it before they could log anything at all. */
export class UpdateMatchEventDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  minute?: number | null;
}
