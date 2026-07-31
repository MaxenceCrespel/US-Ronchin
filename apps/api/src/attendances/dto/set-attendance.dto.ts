import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';

export class SetAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  /** Extra people the player brings along (friends, family...) — not app users, just a headcount. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  guestCount?: number;
}
