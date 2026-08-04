import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Match, MatchStatus } from '../matches/entities/match.entity';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class PushNotificationsScheduler {
  private readonly logger = new Logger(PushNotificationsScheduler.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleMissingResultReminders() {
    const today = new Date().toISOString().slice(0, 10);
    const matches = await this.matchesRepository.find({
      where: {
        date: LessThan(today),
        status: MatchStatus.SCHEDULED,
        resultReminderSentAt: IsNull(),
      },
    });

    for (const match of matches) {
      try {
        await this.pushNotificationsService.sendToCoaches({
          title: 'Résultat manquant',
          body: `Le résultat du match contre ${match.opponent} du ${match.date} n'a pas encore été saisi.`,
          url: `/matches/${match.id}`,
        });
        match.resultReminderSentAt = new Date();
        await this.matchesRepository.save(match);
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de résultat manquant pour le match ${match.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
