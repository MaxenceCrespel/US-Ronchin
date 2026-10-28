import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';
import { PlayerSubPosition } from '../../users/entities/user.entity';

export const MAX_GUESTS_PER_PLAYER = 20;

export class AttendanceGuestDto {
  @IsString()
  @IsNotEmpty()
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

export class SetAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  /** Extra people the player brings along (friends, family...) — not app users, named so the
   * coach knows who's actually showing up. Capped at MAX_GUESTS_PER_PLAYER only so a runaway
   * request can't store thousands of rows — far above any real "+N". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUESTS_PER_PLAYER)
  @ValidateNested({ each: true })
  @Type(() => AttendanceGuestDto)
  guests?: AttendanceGuestDto[];
}
