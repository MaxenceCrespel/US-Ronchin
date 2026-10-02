import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

// Mirrors ScrapedPoolMatch — see ImportStandingsDto's own doc comment for why this endpoint
// exists (epreuves.fff.fr blocks the production server's IP; the local sync script scrapes
// from a machine that isn't blocked and pushes the result here instead).
export class ImportPoolMatchDto {
  // @IsOptional() treats an explicit null the same as a missing field — the scraper always
  // sends a concrete null rather than omitting the key, matching ScrapedPoolMatch's own
  // `string | null` (never `| undefined`) shape.
  @IsOptional()
  @IsString()
  fffMatchId: string | null;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  matchday: string | null;

  @IsString()
  homeTeam: string;

  @IsString()
  awayTeam: string;

  @IsOptional()
  @IsString()
  homeLogo: string | null;

  @IsOptional()
  @IsString()
  awayLogo: string | null;

  @IsOptional()
  @IsInt()
  scoreHome: number | null;

  @IsOptional()
  @IsInt()
  scoreAway: number | null;

  @IsBoolean()
  played: boolean;
}

export class ImportPoolMatchesDto {
  @IsArray()
  // A full-season poule calendar rarely runs past a couple hundred fixtures — sanity
  // ceiling, not a real limit.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportPoolMatchDto)
  matches: ImportPoolMatchDto[];
}
