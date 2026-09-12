import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// Mirrors ScrapedMatch — this is what's sent by the local sync script (see
// scripts/local-fff-sync.js) once epreuves.fff.fr started blocking the production server's own
// IP (see FffSyncService.importScraped's own doc comment for why this endpoint exists at all).
export class ImportScrapedMatchDto {
  @IsOptional()
  @IsString()
  fffMatchId?: string | null;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  kickOffTime?: string | null;

  @IsString()
  opponent: string;

  @IsIn(['HOME', 'AWAY'])
  homeAway: 'HOME' | 'AWAY';

  @IsOptional()
  @IsString()
  venue?: string | null;

  @IsOptional()
  @IsString()
  competition?: string | null;

  @IsOptional()
  @IsInt()
  scoreHome?: number | null;

  @IsOptional()
  @IsInt()
  scoreAway?: number | null;

  @IsBoolean()
  played: boolean;

  @IsOptional()
  @IsString()
  matchDetailUrl?: string | null;

  @IsOptional()
  @IsString()
  surface?: string | null;
}

export class ImportMatchesDto {
  @IsArray()
  // A full season rarely runs past ~35 matches even counting cups — this is just a sanity
  // ceiling against a malformed payload, not a real limit.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportScrapedMatchDto)
  matches: ImportScrapedMatchDto[];
}
