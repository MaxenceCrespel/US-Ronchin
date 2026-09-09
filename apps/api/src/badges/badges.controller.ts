import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  // Admin-only reverse lookup — for every badge, who holds it. Same access rule as
  // users/:userId above, same reason RolesGuard can't express it via @Roles(...).
  @Get('holders')
  getHolders(@CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.badgesService.getHolders();
  }

  // Manual override, same access rule as holders/getForUser above — grants or revokes a
  // badge outright, bypassing eligibility. { userId } in the body rather than the URL to
  // keep both endpoints shaped consistently around the badge key.
  @Post('holders/:key/grant')
  grant(
    @Param('key') key: string,
    @Body() body: { userId: string },
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.badgesService.grantManually(body.userId, key);
  }

  @Delete('holders/:key/:userId')
  revoke(
    @Param('key') key: string,
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.badgesService.revokeManually(userId, key);
  }

  // Bulk undo — wipes a badge from every current holder at once, for a badge that fired
  // wrongly for everyone (e.g. the Mois Parfait mid-month bug) instead of revoking one by
  // one. Same access rule as the rest of this admin-only cluster.
  @Delete('holders/:key')
  revokeFromEveryone(@Param('key') key: string, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.badgesService.revokeFromEveryone(key);
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
