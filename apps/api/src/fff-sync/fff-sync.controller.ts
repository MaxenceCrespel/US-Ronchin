import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { FffSyncService } from './fff-sync.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
@Controller('fff-sync')
export class FffSyncController {
  constructor(private readonly fffSyncService: FffSyncService) {}

  @Post('run')
  run(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.fffSyncService.sync(currentUser.id);
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.fffSyncService.getRecentLogs(limit ? Number(limit) : 5);
  }
}
