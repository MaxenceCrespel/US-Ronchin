import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training, TrainingType } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { AttendancesService } from '../attendances/attendances.service';

const GENERATION_WINDOW_WEEKS = 8;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface TrainingSessionWithTraining extends Omit<TrainingSession, 'training'> {
  trainingType: TrainingType | null;
  maxPresentPlayers: number | null;
}

@Injectable()
export class TrainingsService {
  constructor(
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    private readonly attendancesService: AttendancesService,
  ) {}

  findAllTrainings(): Promise<Training[]> {
    return this.trainingsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findTrainingById(id: string): Promise<Training> {
    const training = await this.trainingsRepository.findOne({ where: { id } });
    if (!training) {
      throw new NotFoundException('Entraînement introuvable');
    }
    return training;
  }

  async createTraining(dto: CreateTrainingDto, createdBy: string): Promise<Training> {
    const training = this.trainingsRepository.create({
      ...dto,
      dayOfWeek: dto.dayOfWeek ?? null,
      endDate: dto.endDate ?? null,
      maxPresentPlayers: dto.maxPresentPlayers ?? null,
      createdBy,
    });
    const saved = await this.trainingsRepository.save(training);
    await this.generateSessions(saved.id);
    return saved;
  }

  async updateTraining(id: string, dto: UpdateTrainingDto): Promise<Training> {
    const training = await this.findTrainingById(id);
    Object.assign(training, dto);
    const saved = await this.trainingsRepository.save(training);
    await this.generateSessions(saved.id);
    await this.syncFutureSessionTimes(saved);
    if (dto.maxPresentPlayers !== undefined) {
      await this.syncCapPromotionsForTraining(saved.id);
    }
    return saved;
  }

  /** Raising the cap doesn't itself touch any Attendance row, so anyone already waitlisted
   * on an affected session would otherwise stay waitlisted even though there's now room —
   * promote as many as now fit on every future session of this training (a session with
   * its own maxPresentPlayersOverride resolves against that instead, unaffected by the
   * template). Past sessions are left alone, same cutoff as syncFutureSessionTimes. */
  private async syncCapPromotionsForTraining(trainingId: string): Promise<void> {
    const today = toDateOnly(new Date());
    const sessions = await this.sessionsRepository.find({ where: { trainingId } });
    for (const session of sessions.filter((s) => s.date >= today)) {
      await this.attendancesService.syncCapPromotions(session.id);
    }
  }

  /** Sessions are snapshotted from the template at generation time (see generateSessions),
   * so editing a recurring Training's hours/location only ever reached sessions not yet
   * created — anything already on the calendar kept its stale copy. Push the new values
   * onto every not-yet-happened session for this training too, so a coach moving "le mardi
   * 19h" to 19h30 sees it reflected right away instead of only for weeks generated after
   * the edit. Past sessions are historical record and stay untouched. */
  private async syncFutureSessionTimes(training: Training): Promise<void> {
    const today = toDateOnly(new Date());
    await this.sessionsRepository
      .createQueryBuilder()
      .update(TrainingSession)
      .set({ startTime: training.startTime, endTime: training.endTime, location: training.location })
      .where('training_id = :trainingId', { trainingId: training.id })
      .andWhere('date >= :today', { today })
      .execute();
  }

  async deleteTraining(id: string): Promise<void> {
    await this.findTrainingById(id);
    await this.trainingsRepository.delete(id);
  }

  async generateSessions(trainingId: string): Promise<TrainingSession[]> {
    const training = await this.findTrainingById(trainingId);

    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + GENERATION_WINDOW_WEEKS * 7);

    const trainingEnd = training.endDate ? new Date(training.endDate) : null;
    const effectiveEnd = trainingEnd && trainingEnd < windowEnd ? trainingEnd : windowEnd;

    const datesToEnsure: string[] = [];

    if (training.type === TrainingType.ONE_OFF) {
      datesToEnsure.push(training.startDate);
    } else {
      const cursor = new Date(training.startDate);
      while (cursor.getUTCDay() !== training.dayOfWeek) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      while (cursor <= effectiveEnd) {
        datesToEnsure.push(toDateOnly(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }

    const existing = await this.sessionsRepository.find({ where: { trainingId } });
    const existingDates = new Set(existing.map((s) => s.date));

    const newSessions = datesToEnsure
      .filter((date) => !existingDates.has(date))
      .map((date) =>
        this.sessionsRepository.create({
          trainingId: training.id,
          date,
          startTime: training.startTime,
          endTime: training.endTime,
          location: training.location,
        }),
      );

    if (newSessions.length === 0) {
      return existing;
    }

    const saved = await this.sessionsRepository.save(newSessions);
    return [...existing, ...saved];
  }

  async createAdHocSession(dto: CreateTrainingSessionDto): Promise<TrainingSession> {
    const session = this.sessionsRepository.create({ ...dto, trainingId: null });
    return this.sessionsRepository.save(session);
  }

  /** Flattens the parent Training's type onto each session, plus the EFFECTIVE cap — this
   * session's own maxPresentPlayersOverride if it has one, else the template's
   * maxPresentPlayers. The frontend edits that resolved number directly from a session's
   * own card regardless of type; it always writes back as an override on the session,
   * never the template (see SessionCard / updateSession). */
  async findSessionsBetween(from?: string, to?: string): Promise<TrainingSessionWithTraining[]> {
    const query = this.sessionsRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.training', 'training')
      .orderBy('session.date', 'ASC')
      .addOrderBy('session.startTime', 'ASC');

    if (from) {
      query.andWhere('session.date >= :from', { from });
    }
    if (to) {
      query.andWhere('session.date <= :to', { to });
    }

    const sessions = await query.getMany();
    return sessions.map(({ training, ...session }) => ({
      ...session,
      trainingType: training?.type ?? null,
      maxPresentPlayers: session.maxPresentPlayersOverride ?? training?.maxPresentPlayers ?? null,
    }));
  }

  async findSessionById(id: string): Promise<TrainingSession> {
    const session = await this.sessionsRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }
    return session;
  }

  async updateSession(id: string, dto: UpdateTrainingSessionDto): Promise<TrainingSession> {
    const session = await this.findSessionById(id);
    Object.assign(session, dto);
    const saved = await this.sessionsRepository.save(session);
    if (dto.maxPresentPlayersOverride !== undefined) {
      await this.attendancesService.syncCapPromotions(saved.id);
    }
    return saved;
  }

  async deleteSession(id: string): Promise<void> {
    await this.findSessionById(id);
    await this.sessionsRepository.delete(id);
  }
}
