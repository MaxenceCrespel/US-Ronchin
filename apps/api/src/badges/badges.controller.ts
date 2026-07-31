import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { BadgesService } from './badges.service';

@UseGuards(JwtAuthGuard)
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get('me')
  getMine(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.badgesService.getForUser(currentUser.id);
  }

  @Get('users/:userId')
  getForUser(@Param('userId') userId: string) {
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
