import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TeamBalancingService } from './team-balancing.service';

@Injectable()
export class TeamBalancingScheduler {
  private readonly logger = new Logger(TeamBalancingScheduler.name);

  constructor(private readonly teamBalancingService: TeamBalancingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoGeneration() {
    const sessions = await this.teamBalancingService.findUpcomingSessionsNeedingTeams();
    for (const session of sessions) {
      try {
        await this.teamBalancingService.generateTeams(session.id);
        this.logger.log(`Équipes générées automatiquement pour la séance ${session.id}`);
      } catch (error) {
        this.logger.warn(
          `Génération auto des équipes impossible pour la séance ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
