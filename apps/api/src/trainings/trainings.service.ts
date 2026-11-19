import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training, TrainingType } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { AttendancesService } from '../attendances/attendances.service';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { parisDateOnly, parisToday, parisWallTimeToDate } from '../common/utils/paris-time';

const GENERATION_WINDOW_WEEKS = 8;

// `date.toISOString().slice(0, 10)` is the UTC calendar date — the wrong side of midnight
// for roughly two hours a day in Paris (server runs in UTC, Paris is ahead of it), which
// would make "today" here lag behind the real Paris date late in the evening.
function toDateOnly(date: Date): string {
  return parisDateOnly(date);
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** "de ce soir" / "d'aujourd'hui" / "de demain" / "du mardi 25/11" — how the push names the
 * session's day, relative to today in Paris. */
function describeSessionDay(session: Pick<TrainingSession, 'date' | 'startTime'>): string {
  const today = parisToday();
  const tomorrow = parisDateOnly(new Date(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000));
  if (session.date === today) return session.startTime >= '17:00' ? 'de ce soir' : "d'aujourd'hui";
  if (session.date === tomorrow) return 'de demain';
  const [, month, day] = session.date.split('-');
  const weekday = WEEKDAYS[new Date(`${session.date}T12:00:00Z`).getUTCDay()];
  return `du ${weekday} ${day}/${month}`;
}

export interface TrainingSessionWithTraining extends Omit<TrainingSession, 'training'> {
  trainingType: TrainingType | null;
  maxPresentPlayers: number | null;
}

@Injectable()
export class TrainingsService {
  private readonly logger = new Logger(TrainingsService.name);

  constructor(
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly attendancesService: AttendancesService,
    private readonly pushNotificationsService: PushNotificationsService,
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
    const previousDayOfWeek = training.dayOfWeek;
    Object.assign(training, dto);
    const saved = await this.trainingsRepository.save(training);
    await this.generateSessions(saved.id);
    await this.syncFutureSessionTimes(saved);
    if (saved.type === TrainingType.RECURRING && saved.dayOfWeek !== previousDayOfWeek) {
      await this.retireSessionsOffSchedule(saved);
    }
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

  /** Moving a recurring training to another weekday only ever ADDED the new weekday's
   * sessions — the upcoming ones on the old weekday stayed on the calendar, open for answers.
   * Those still to come (today's is left alone, it may well be happening) are retired: one
   * with nothing recorded against it is deleted, one a player has already answered (or with
   * teams or a score) is cancelled instead, so what people declared isn't silently erased
   * but nobody can answer a session that no longer takes place. */
  private async retireSessionsOffSchedule(training: Training): Promise<void> {
    const today = toDateOnly(new Date());
    const sessions = await this.sessionsRepository.find({ where: { trainingId: training.id } });
    for (const session of sessions) {
      if (session.date <= today) continue;
      if (new Date(`${session.date}T00:00:00Z`).getUTCDay() === training.dayOfWeek) continue;

      const hasData =
        session.scoreTeam0 != null ||
        session.scoreTeam1 != null ||
        (await this.attendancesService.sessionHasActivity(session.id));
      if (hasData) {
        if (!session.cancelled) await this.sessionsRepository.update(session.id, { cancelled: true });
      } else {
        await this.sessionsRepository.delete(session.id);
      }
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

  async updateSession(
    id: string,
    dto: UpdateTrainingSessionDto,
    actorId?: string,
  ): Promise<TrainingSession> {
    const session = await this.findSessionById(id);
    const wasCancelled = session.cancelled;
    Object.assign(session, dto);
    // The note only means something on a cancelled session: trimmed, empty → none, and
    // wiped on reinstatement so a stale "remplacé par un five" never resurfaces.
    session.cancellationNote = session.cancelled ? session.cancellationNote?.trim() || null : null;
    const saved = await this.sessionsRepository.save(session);
    if (dto.maxPresentPlayersOverride !== undefined) {
      await this.attendancesService.syncCapPromotions(saved.id);
    }
    if (saved.cancelled !== wasCancelled) {
      // A failed push must never undo or fail the cancellation itself.
      await this.notifyCancellationChange(saved, actorId).catch((error: unknown) =>
        this.logger.warn(
          `Échec de la notification d'annulation pour la séance ${saved.id}: ${error instanceof Error ? error.message : error}`,
        ),
      );
    }
    return saved;
  }

  /** Cancelling (or reinstating) a session that hasn't finished yet pushes everyone on the
   * roster — players and coaches — except whoever made the change and those who had already
   * said they wouldn't come. Not muteable: a session that no longer happens is exactly the
   * kind of news nobody should miss. */
  private async notifyCancellationChange(session: TrainingSession, actorId?: string): Promise<void> {
    if (parisWallTimeToDate(session.date, session.endTime).getTime() <= Date.now()) return;

    const [roster, absents] = await Promise.all([
      this.usersRepository.find({
        where: [
          { role: UserRole.PLAYER, status: UserStatus.ACTIVE },
          { role: UserRole.COACH, status: UserStatus.ACTIVE },
          { role: UserRole.SUPERADMIN, status: UserStatus.ACTIVE },
          { isPlayingCoach: true, status: UserStatus.ACTIVE },
        ],
      }),
      this.attendancesRepository.find({
        where: { trainingSessionId: session.id, status: AttendanceStatus.ABSENT },
      }),
    ]);
    const skip = new Set([...absents.map((a) => a.userId), actorId]);
    const targets = [...new Set(roster.map((u) => u.id))].filter((userId) => !skip.has(userId));
    if (targets.length === 0) return;

    const when = describeSessionDay(session);
    const time = session.startTime.slice(0, 5).replace(':', 'h');
    await this.pushNotificationsService.sendToUsers(targets, {
      title: session.cancelled ? 'Entraînement annulé' : 'Entraînement maintenu',
      body: session.cancelled
        ? `L'entraînement ${when} (${time}) est annulé.${session.cancellationNote ? ` ${session.cancellationNote}` : ''}`
        : `Finalement l'entraînement ${when} (${time}) a bien lieu.`,
      url: `/trainings?session=${session.id}`,
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.findSessionById(id);
    await this.sessionsRepository.delete(id);
  }
}
