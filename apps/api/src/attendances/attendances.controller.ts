import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { AttendancesService } from './attendances.service';
import { SetAttendanceDto } from './dto/set-attendance.dto';
import { ValidateAttendanceDto } from './dto/validate-attendance.dto';
import { sanitizeUser } from '../common/utils/sanitize-user';

@UseGuards(JwtAuthGuard)
@Controller('training-sessions/:sessionId/attendance')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @Get()
  async findAll(@Param('sessionId') sessionId: string) {
    const attendances = await this.attendancesService.findBySession(sessionId);
    return attendances.map((attendance) => ({
      ...attendance,
      user: sanitizeUser(attendance.user),
    }));
  }

  @Put()
  setMine(
    @Param('sessionId') sessionId: string,
    @Body() dto: SetAttendanceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.attendancesService.setAttendance(
      sessionId,
      currentUser.id,
      dto.status,
      dto.guests,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Put(':userId/actual')
  validate(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @Body() dto: ValidateAttendanceDto,
  ) {
    return this.attendancesService.validateAttendance(sessionId, userId, dto.status);
  }
}
