import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlayerPosition } from '../../users/entities/user.entity';

export class CompositionEntryDto {
  /** The existing composition row's id, when editing an already-saved entry — lets
   * setComposition update in place instead of delete+recreate, so votes cast against a
   * guest entry (FK'd to the composition row, see MatchMotmVote) survive a re-save. */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** Exactly one of userId/(guestFirstName+guestLastName) must be set — enforced in
   * MatchesService.setComposition, same convention as CreateMatchEventDto's scorerName. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestFirstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestLastName?: string;

  @IsBoolean()
  isStarter: boolean;

  @IsOptional()
  @IsEnum(PlayerPosition)
  position?: PlayerPosition;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  shirtNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  formationX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  formationY?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SetCompositionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionEntryDto)
  entries: CompositionEntryDto[];
}
