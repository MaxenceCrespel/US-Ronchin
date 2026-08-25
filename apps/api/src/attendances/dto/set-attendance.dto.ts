import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';

export class SetAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  /** Extra people the player brings along (friends, family...) — not app users, just a headcount.
   * No upper bound — a coach welcoming a big group for an open training shouldn't hit a wall. */
  @IsOptional()
  @IsInt()
  @Min(0)
  guestCount?: number;
}
