import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlayerSubPosition } from '../../users/entities/user.entity';

export class AddMatchGuestDto {
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
