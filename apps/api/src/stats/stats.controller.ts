import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
}
