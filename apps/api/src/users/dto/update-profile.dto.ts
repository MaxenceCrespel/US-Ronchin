import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PlayerSubPosition, PreferredFoot } from '../entities/user.entity';

export class UpdateProfileDto {
  @IsOptional()
  @IsArray()
  @IsEnum(PlayerSubPosition, { each: true })
  positions?: PlayerSubPosition[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number;

  @IsOptional()
  @IsEnum(PreferredFoot)
  preferredFoot?: PreferredFoot;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(230)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(200)
  weightKg?: number;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsPhoneNumber('FR')
  phone?: string;

  @IsOptional()
  @IsBoolean()
  hasSeenOnboarding?: boolean;
}
