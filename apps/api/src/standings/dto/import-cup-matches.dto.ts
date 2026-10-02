import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

// Mirrors ScrapedCupMatch — see ImportPoolMatchesDto's own doc comment for why this endpoint
// exists (the local sync script scrapes from a machine that isn't blocked and pushes the
// result here instead of the server scraping itself).
export class ImportCupMatchDto {
  @IsOptional()
  @IsString()
  fffMatchId: string | null;

  @IsString()
  date: string;

  @IsString()
  round: string;

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

export class ImportCupMatchesDto {
  @IsArray()
  // A full cup draw across every round so far never runs anywhere near this — sanity ceiling,
  // not a real limit.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportCupMatchDto)
  matches: ImportCupMatchDto[];
}
