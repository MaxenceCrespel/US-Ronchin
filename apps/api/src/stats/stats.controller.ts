import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('players')
  getPlayerStats(@Query('season') season?: string) {
    return this.statsService.getPlayerStats(season);
  }

  @Get('team')
  getTeamStats(@Query('season') season?: string) {
    return this.statsService.getTeamStats(season);
  }

  @Get('seasons')
  getAvailableSeasons() {
    return this.statsService.getAvailableSeasons();
  }

  @Get('monthly-challenges')
  getMonthlyChallenges() {
    return this.statsService.getMonthlyChallenges();
  }

  @Get('my-attendance-trophies')
  getMyAttendanceTrophies(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.statsService.getMyAttendanceTrophies(currentUser.id);
  }

  @Get('my-training-champion-trophies')
  getMyTrainingChampionTrophies(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.statsService.getMyTrainingChampionTrophies(currentUser.id);
  }

  // Unlike the "my-*" routes above, these two answer "who actually won", not "did I win" —
  // any authenticated player can see them, not just the winner (see TeamHallOfFameCard).
  @Get('last-attendance-trophy-winner')
  getLastAttendanceTrophyWinner() {
    return this.statsService.getLastAttendanceTrophyWinner();
  }

  @Get('last-training-champion-winner')
  getLastTrainingChampionWinner() {
    return this.statsService.getLastTrainingChampionWinner();
  }
}
