import { Controller, ForbiddenException, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { BadgesService } from './badges.service';

@UseGuards(JwtAuthGuard)
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get('me')
  getMine(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.badgesService.getForUser(currentUser.id);
  }

  // Admin-only — a coach doesn't get to browse anyone's badge grid, only the admin does
  // (see push-notifications.controller.ts's subscribed-users for the same split, since
  // RolesGuard can't express "admin but not coach" through @Roles(...)).
  @Get('users/:userId')
  getForUser(@Param('userId') userId: string, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.badgesService.getForUser(userId);
  }

  @Get('level')
  getMyLevel(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.badgesService.getAccountLevel(currentUser.id);
  }

  @Get('levels')
  getAllLevels() {
    return this.badgesService.getAccountLevelsForAll();
  }

  @Get('users/:userId/level')
  getLevelForUser(@Param('userId') userId: string) {
    return this.badgesService.getAccountLevel(userId);
  }
}
