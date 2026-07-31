import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('players')
  getPlayerStats() {
    return this.statsService.getPlayerStats();
  }

  @Get('team')
  getTeamStats() {
    return this.statsService.getTeamStats();
  }

  @Get('monthly-challenges')
  getMonthlyChallenges() {
    return this.statsService.getMonthlyChallenges();
  }
}
