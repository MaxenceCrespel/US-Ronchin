import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PlayerSubPosition, PreferredFoot } from '../entities/user.entity';

export class UpdateProfileDto {
  // Capped at 3 — a genuinely versatile player covers 2-3 positions realistically; without
  // a limit, a handful of players were selecting every single position, which broke the
  // team-balancing "band coverage" safety net (bandsCovered() in TeamBalancingService
  // treats them as able to cover any team's gap, whether or not they'd actually play there).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
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
