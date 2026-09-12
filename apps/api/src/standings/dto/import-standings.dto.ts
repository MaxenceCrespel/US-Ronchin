import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, ValidateNested } from 'class-validator';

// Mirrors ScrapedStanding — see ImportMatchesDto's own doc comment for why this endpoint
// exists (epreuves.fff.fr blocks the production server's IP; the local sync script scrapes
// from a machine that isn't blocked and pushes the result here instead).
export class ImportScrapedStandingDto {
  @IsInt()
  rank: number;

  @IsString()
  teamName: string;

  @IsInt()
  points: number;

  @IsInt()
  played: number;

  @IsInt()
  won: number;

  @IsInt()
  drawn: number;

  @IsInt()
  lost: number;

  @IsInt()
  goalsFor: number;

  @IsInt()
  goalsAgainst: number;

  @IsInt()
  goalDifference: number;
}

export class ImportStandingsDto {
  @IsArray()
  // A poule rarely runs past ~20 teams — sanity ceiling, not a real limit.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ImportScrapedStandingDto)
  standings: ImportScrapedStandingDto[];
}
