import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from './entities/user.entity';
import { PlayerSeparationRulesService } from './player-separation-rules.service';
import { CreateSeparationRuleDto } from './dto/create-separation-rule.dto';

// Deliberately admin-only, not the usual coach-or-admin split — RolesGuard always lets
// SUPERADMIN through any @Roles(...) list, so it can't express "admin but not coach" (same
// pattern as push-notifications' subscribed-users and badges' getForUser). Manual check
// instead of the guard/decorator.
@UseGuards(JwtAuthGuard)
@Controller('player-separation-rules')
export class PlayerSeparationRulesController {
  constructor(private readonly rulesService: PlayerSeparationRulesService) {}

  @Get(':userId')
  getForUser(@Param('userId') userId: string, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.rulesService.findForUser(userId);
  }

  @Post()
  create(@Body() dto: CreateSeparationRuleDto, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.rulesService.create(dto.userAId, dto.userBId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.rulesService.remove(id);
  }
}
