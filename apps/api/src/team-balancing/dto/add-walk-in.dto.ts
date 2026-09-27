import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlayerSubPosition } from '../../users/entities/user.entity';
import { Transform } from 'class-transformer';

/** Someone who showed up without being on the original list at all — no app account,
 * nobody registered them as a guest either (see TeamBalancingService.addWalkIn). */
export class AddWalkInDto {
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsEnum(PlayerSubPosition)
  position?: PlayerSubPosition;
}
