import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { sanitizeUser } from '../common/utils/sanitize-user';
import { TeamBalancingService } from './team-balancing.service';
import { GenerateTeamsDto } from './dto/generate-teams.dto';
import { MovePlayerDto } from './dto/move-player.dto';

@UseGuards(JwtAuthGuard)
@Controller('training-sessions/:sessionId/teams')
export class TeamBalancingController {
  constructor(private readonly teamBalancingService: TeamBalancingService) {}

  @Get()
  async getTeams(@Param('sessionId') sessionId: string) {
    const teams = await this.teamBalancingService.getTeams(sessionId);
    return teams.map((t) => ({ ...t, user: t.user ? sanitizeUser(t.user) : null }));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('generate')
  async generate(@Param('sessionId') sessionId: string, @Body() dto: GenerateTeamsDto) {
    const teams = await this.teamBalancingService.generateTeams(sessionId, dto.teamCount);
    return teams.map((t) => ({ ...t, user: t.user ? sanitizeUser(t.user) : null }));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch()
  async move(@Param('sessionId') sessionId: string, @Body() dto: MovePlayerDto) {
    const teams = await this.teamBalancingService.moveAssignment(
      sessionId,
      dto.assignmentId,
      dto.teamIndex,
    );
    return teams.map((t) => ({ ...t, user: t.user ? sanitizeUser(t.user) : null }));
  }
}
