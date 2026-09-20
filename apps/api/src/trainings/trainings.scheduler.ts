import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrainingType } from './entities/training.entity';
import { TrainingsService } from './trainings.service';
import { parisToday } from '../common/utils/paris-time';

/** generateSessions only ever ensures sessions up to "now + GENERATION_WINDOW_WEEKS" AT THE
 * MOMENT IT RUNS — it's called from createTraining/updateTraining, but nothing re-runs it
 * afterwards. Left alone, a RECURRING training's session list quietly stops advancing
 * forever at whatever date that window resolved to on its last edit, which is exactly what
 * showed up as "no trainings past Oct 29" for a template nobody had touched since. This
 * keeps every open-ended recurring training topped up by re-running the same (idempotent —
 * it only ever inserts dates that don't already have a session) generation daily. */
@Injectable()
export class TrainingsScheduler {
  private readonly logger = new Logger(TrainingsScheduler.name);

  constructor(private readonly trainingsService: TrainingsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Europe/Paris' })
  async handleSessionGenerationRollForward() {
    const today = parisToday();
    const trainings = await this.trainingsService.findAllTrainings();
    const openEnded = trainings.filter(
      (t) => t.type === TrainingType.RECURRING && (!t.endDate || t.endDate >= today),
    );

    for (const training of openEnded) {
      try {
        await this.trainingsService.generateSessions(training.id);
      } catch (error) {
        this.logger.warn(
          `Échec de la génération de séances pour l'entraînement ${training.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
