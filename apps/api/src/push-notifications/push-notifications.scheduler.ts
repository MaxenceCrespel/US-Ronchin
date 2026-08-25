import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Match, MatchStatus } from '../matches/entities/match.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class PushNotificationsScheduler {
  private readonly logger = new Logger(PushNotificationsScheduler.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Europe/Paris' })
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

  @Cron(CronExpression.EVERY_30_MINUTES, { timeZone: 'Europe/Paris' })
  async handleMissingAttendanceReminders() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const candidateSessions = await this.sessionsRepository.find({
      where: {
        date: LessThanOrEqual(today),
        cancelled: false,
        attendanceReminderSentAt: IsNull(),
      },
    });

    for (const session of candidateSessions) {
      const sessionEnd = new Date(`${session.date}T${session.endTime}`);
      if (sessionEnd.getTime() > now.getTime()) continue;

      try {
        const validatedCount = await this.attendancesRepository.count({
          where: { trainingSessionId: session.id, actualStatus: Not(IsNull()) },
        });
        if (validatedCount === 0) {
          await this.pushNotificationsService.sendToCoaches({
            title: 'Pointage à faire',
            body: `Le pointage réel de l'entraînement du ${session.date} n'a pas encore été fait.`,
            url: '/trainings',
          });
        }
        session.attendanceReminderSentAt = new Date();
        await this.sessionsRepository.save(session);
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de pointage manquant pour la séance ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
