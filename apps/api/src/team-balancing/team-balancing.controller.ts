import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { sanitizeUser } from '../common/utils/sanitize-user';
import { TeamBalancingService } from './team-balancing.service';
import { GenerateTeamsDto } from './dto/generate-teams.dto';
import { MovePlayerDto } from './dto/move-player.dto';
import { AddWalkInDto } from './dto/add-walk-in.dto';
import { LinkPastTrainingsDto } from './dto/link-past-trainings.dto';

@UseGuards(JwtAuthGuard)
@Controller('training-ranking')
export class TrainingRankingController {
  constructor(private readonly teamBalancingService: TeamBalancingService) {}

  @Get()
  getRanking() {
    return this.teamBalancingService.getTrainingRanking();
  }
}

// Someone who trained as an unlinked guest before creating their own account — coach
// retroactively credits their past sessions in one go. Spans every session, so it doesn't
// fit under a single :sessionId/teams scope like TeamBalancingController below.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
@Controller('training-guest-matches')
export class PastTrainingGuestsController {
  constructor(private readonly teamBalancingService: TeamBalancingService) {}

  @Get()
  findMatches(@Query('firstName') firstName: string, @Query('lastName') lastName: string) {
    return this.teamBalancingService.findUnlinkedGuestMatches(firstName ?? '', lastName ?? '');
  }

  @Post('link')
  async link(@Body() dto: LinkPastTrainingsDto) {
    const linkedCount = await this.teamBalancingService.linkPastGuestTrainings(
      dto.userId,
      dto.assignmentIds,
    );
    return { linkedCount };
  }
}

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

  // Post-training reconciliation against the coach's pointage réel — distinct from
  // generate/regenerate above, which fully re-balances from scratch and is only right
  // before kickoff. See TeamBalancingService.confirmFinalTeams for why.
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch('confirm')
  async confirm(@Param('sessionId') sessionId: string) {
    const teams = await this.teamBalancingService.confirmFinalTeams(sessionId);
    return teams.map((t) => ({ ...t, user: t.user ? sanitizeUser(t.user) : null }));
  }

  // Adds someone who showed up without being on the original list at all — no account, no
  // one registered them as a guest. See TeamBalancingService.addWalkIn.
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('walk-in')
  async addWalkIn(@Param('sessionId') sessionId: string, @Body() dto: AddWalkInDto) {
    const teams = await this.teamBalancingService.addWalkIn(sessionId, dto);
    return teams.map((t) => ({ ...t, user: t.user ? sanitizeUser(t.user) : null }));
  }

  // Removes one guest slot immediately (not a full regenerate) — e.g. a declared +1 who
  // ends up not coming. Real players use the pointage réel + confirm flow instead.
  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete(':assignmentId')
  async removeGuest(
    @Param('sessionId') sessionId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    const teams = await this.teamBalancingService.removeGuestFromTeam(sessionId, assignmentId);
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
