import { IsEnum } from 'class-validator';
import { AttendanceStatus } from '../entities/attendance.entity';

export class ValidateAttendanceDto {
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;
}
