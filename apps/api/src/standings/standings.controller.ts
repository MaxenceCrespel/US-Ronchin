import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { StandingsService } from './standings.service';

@UseGuards(JwtAuthGuard)
@Controller('standings')
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get()
  findAll() {
    return this.standingsService.findAll();
  }

  @Get('logs')
  getLogs(@Query('limit') limit?: string) {
    return this.standingsService.getRecentLogs(limit ? Number(limit) : 5);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('sync')
  sync(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.standingsService.sync(currentUser.id);
  }
}
