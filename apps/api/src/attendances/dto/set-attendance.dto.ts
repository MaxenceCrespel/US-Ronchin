import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';
import { PlayerSubPosition } from '../../users/entities/user.entity';

export class AttendanceGuestDto {
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

export class SetAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  /** Extra people the player brings along (friends, family...) — not app users, named so the
   * coach knows who's actually showing up. No upper bound. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceGuestDto)
  guests?: AttendanceGuestDto[];
}
