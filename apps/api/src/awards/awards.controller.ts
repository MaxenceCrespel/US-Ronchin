import { Body, Controller, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { AwardsService } from './awards.service';
import { SetCategoryActiveDto } from './dto/set-category-active.dto';
import { CastVoteDto } from './dto/cast-vote.dto';

@UseGuards(JwtAuthGuard)
@Controller('awards')
export class AwardsController {
  constructor(private readonly awardsService: AwardsService) {}

  @Get('categories')
  findAll(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.awardsService.findAll(currentUser.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch('categories/:id')
  setActive(@Param('id') id: string, @Body() dto: SetCategoryActiveDto) {
    return this.awardsService.setActive(id, dto.isActive);
  }

  @Put('categories/:id/vote')
  vote(
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.awardsService.vote(id, currentUser.id, dto.votedForId);
  }
}
