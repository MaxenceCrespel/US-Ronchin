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
  @IsUUID()
  userId: string;

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
