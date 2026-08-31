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

  // Coach correcting a mistaken declaration ("said Present, isn't coming after all") —
  // distinct from setMine (self-service, locked 30 min before kickoff) and from
  // validate/actual (the post-hoc real-attendance record). This edits the same declared
  // status that team generation reads from, specifically so the coach can fix it and then
  // regenerate — bypasses the lock entirely since fixing it before regenerating is the
  // whole point.
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Put(':userId')
  setForPlayer(
    @Param('sessionId') sessionId: string,
    @Param('userId') userId: string,
    @Body() dto: SetAttendanceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.attendancesService.setAttendance(
      sessionId,
      userId,
      dto.status,
      dto.guests,
      true,
      currentUser.id,
    );
  }

  // Coach-only trail of every declared-status change for this session — see
  // AttendanceStatusChange, added to settle "I never touched it" disputes.
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Get('history')
  async findHistory(@Param('sessionId') sessionId: string) {
    const changes = await this.attendancesService.findStatusHistory(sessionId);
    return changes.map((c) => ({
      ...c,
      user: sanitizeUser(c.user),
      changer: sanitizeUser(c.changer),
    }));
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
