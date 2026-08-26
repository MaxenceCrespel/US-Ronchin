import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsBoolean()
  hasSeenOnboarding?: boolean;
}
