import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlayerSubPosition } from '../../users/entities/user.entity';

/** Someone who showed up without being on the original list at all — no app account,
 * nobody registered them as a guest either (see TeamBalancingService.addWalkIn). */
export class AddWalkInDto {
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEnum(PlayerSubPosition)
  position?: PlayerSubPosition;
}
