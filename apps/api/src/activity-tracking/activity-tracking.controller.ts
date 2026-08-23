import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
