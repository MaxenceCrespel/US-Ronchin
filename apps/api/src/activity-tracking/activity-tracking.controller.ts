import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { ActivityTrackingService } from './activity-tracking.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
@Controller('admin')
export class ActivityTrackingController {
  constructor(private readonly activityTrackingService: ActivityTrackingService) {}

  @Get('kpis')
  getKpis() {
    return this.activityTrackingService.getKpis();
  }
}

// Separate controller: any authenticated user self-reports their own install state, not
// just admins (unlike the KPI dashboard above, which only an admin reads).
@UseGuards(JwtAuthGuard)
@Controller('activity')
export class ActivitySelfReportController {
  constructor(private readonly activityTrackingService: ActivityTrackingService) {}

  @Post('pwa-install')
  recordPwaInstall(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.activityTrackingService.recordPwaInstall(currentUser.id);
  }
}
