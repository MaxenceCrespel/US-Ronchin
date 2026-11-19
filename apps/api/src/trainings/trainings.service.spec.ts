import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrainingsService } from './trainings.service';
import { Training, TrainingType } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { AttendancesService } from '../attendances/attendances.service';
import { Attendance } from '../attendances/entities/attendance.entity';
import { User } from '../users/entities/user.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

/** Collaborators only the cancellation push needs — inert for the other suites. */
const unusedCancellationDeps = [
  { provide: getRepositoryToken(Attendance), useValue: {} },
  { provide: getRepositoryToken(User), useValue: {} },
  { provide: PushNotificationsService, useValue: {} },
];

interface FakeSession {
  trainingId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

async function build(
  training: Partial<Training> | null,
  existing: string[] = [],
) {
  const stored: FakeSession[] = existing.map((date) => ({
    trainingId: 't1',
    date,
    startTime: '19:00',
    endTime: '20:30',
    location: 'Stade',
  }));
  const trainingsRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(training ? { id: 't1', ...training } : null),
  };
  const sessionsRepo = {
    find: jest.fn(() => Promise.resolve([...stored])),
    create: jest.fn((s: FakeSession) => s),
    save: jest.fn((list: FakeSession[]) => {
      stored.push(...list);
      return Promise.resolve(list);
    }),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrainingsService,
      { provide: getRepositoryToken(Training), useValue: trainingsRepo },
      { provide: getRepositoryToken(TrainingSession), useValue: sessionsRepo },
      { provide: AttendancesService, useValue: {} },
      ...unusedCancellationDeps,
    ],
  }).compile();
  return { service: moduleRef.get(TrainingsService), sessionsRepo, stored };
}

const recurring = (over: Partial<Training> = {}): Partial<Training> => ({
  type: TrainingType.RECURRING,
  dayOfWeek: 2, // Tuesday
  startDate: '2026-09-01',
  endDate: null,
  startTime: '19:00',
  endTime: '20:30',
  location: 'Stade',
  ...over,
});

describe('TrainingsService.generateSessions', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T10:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('creates one session per matching weekday over the 8-week window', async () => {
    const { service, stored } = await build(recurring());
    await service.generateSessions('t1');

    const dates = stored.map((s) => s.date);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates.every((d) => new Date(d).getUTCDay() === 2)).toBe(true);
    // window ends 8 weeks after "today" (2026-09-20 → 2026-11-15): last Tuesday is 2026-11-10
    expect(dates[dates.length - 1]).toBe('2026-11-10');
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('is idempotent: a second run adds nothing', async () => {
    const { service, stored, sessionsRepo } = await build(recurring());
    await service.generateSessions('t1');
    const count = stored.length;
    sessionsRepo.save.mockClear();

    await service.generateSessions('t1');

    expect(stored.length).toBe(count);
    expect(sessionsRepo.save).not.toHaveBeenCalled();
  });

  it('only fills the missing dates when some already exist', async () => {
    const { service, stored } = await build(recurring(), [
      '2026-09-01',
      '2026-09-08',
    ]);
    await service.generateSessions('t1');
    expect(stored.filter((s) => s.date === '2026-09-01')).toHaveLength(1);
    expect(stored.some((s) => s.date === '2026-09-15')).toBe(true);
  });

  it('stops at the training end date', async () => {
    const { service, stored } = await build(
      recurring({ endDate: '2026-09-30' }),
    );
    await service.generateSessions('t1');
    expect(stored[stored.length - 1].date).toBe('2026-09-29');
  });

  it('starts on the first matching weekday on or after the start date', async () => {
    const { service, stored } = await build(
      recurring({ startDate: '2026-09-02', dayOfWeek: 2 }),
    );
    await service.generateSessions('t1');
    expect(stored[0].date).toBe('2026-09-08');
  });

  it('a one-off training yields exactly its own date', async () => {
    const { service, stored } = await build({
      type: TrainingType.ONE_OFF,
      startDate: '2026-10-05',
      startTime: '18:00',
      endTime: '19:30',
      location: 'Salle',
    });
    await service.generateSessions('t1');
    expect(stored.map((s) => s.date)).toEqual(['2026-10-05']);
  });

  it('copies hours and location from the template', async () => {
    const { service, stored } = await build(
      recurring({ location: 'Terrain B', startTime: '19:30' }),
    );
    await service.generateSessions('t1');
    expect(stored[0]).toMatchObject({
      location: 'Terrain B',
      startTime: '19:30',
    });
  });

  it('throws when the training does not exist', async () => {
    const { service } = await build(null);
    await expect(service.generateSessions('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('TrainingsService.updateTraining — moving to another weekday', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-20T10:00:00Z'))); // a Sunday
  afterEach(() => jest.useRealTimers());

  async function buildUpdate(sessions: Record<string, unknown>[], hasActivity: Record<string, boolean> = {}) {
    const training = { id: 't1', ...recurring({ dayOfWeek: 2 }) };
    const stored = sessions.map((s, i) => ({ id: `s${i}`, trainingId: 't1', cancelled: false, ...s }));
    const chain: Record<string, unknown> = {};
    for (const k of ['update', 'set', 'where', 'andWhere']) chain[k] = () => chain;
    chain.execute = () => Promise.resolve();
    const sessionsRepo = {
      find: jest.fn(() => Promise.resolve([...stored])),
      create: jest.fn((s: unknown) => s),
      save: jest.fn((list: unknown[]) => Promise.resolve(list)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => chain),
    };
    const attendancesService = {
      sessionHasActivity: jest.fn((id: string) => Promise.resolve(hasActivity[id] ?? false)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrainingsService,
        {
          provide: getRepositoryToken(Training),
          useValue: { findOne: jest.fn().mockResolvedValue(training), save: jest.fn((t: unknown) => Promise.resolve(t)) },
        },
        { provide: getRepositoryToken(TrainingSession), useValue: sessionsRepo },
        { provide: AttendancesService, useValue: attendancesService },
        ...unusedCancellationDeps,
      ],
    }).compile();
    return { service: moduleRef.get(TrainingsService), sessionsRepo };
  }

  // Tuesdays: 2026-09-22, 2026-09-29. Thursdays: 2026-09-24. Today (Sunday 20th) is excluded.
  const tuesdays = [{ date: '2026-09-22' }, { date: '2026-09-29' }];

  it('deletes upcoming sessions on the old weekday that nobody answered', async () => {
    const { service, sessionsRepo } = await buildUpdate(tuesdays);
    await service.updateTraining('t1', { dayOfWeek: 4 });
    expect(sessionsRepo.delete).toHaveBeenCalledTimes(2);
    expect(sessionsRepo.update).not.toHaveBeenCalled();
  });

  it('cancels, rather than deletes, one that already has answers or teams', async () => {
    const { service, sessionsRepo } = await buildUpdate(tuesdays, { s0: true });
    await service.updateTraining('t1', { dayOfWeek: 4 });
    expect(sessionsRepo.update).toHaveBeenCalledWith('s0', { cancelled: true });
    expect(sessionsRepo.delete).toHaveBeenCalledWith('s1');
  });

  it('cancels one that already has a score', async () => {
    const { service, sessionsRepo } = await buildUpdate([{ date: '2026-09-22', scoreTeam0: 2, scoreTeam1: 1 }]);
    await service.updateTraining('t1', { dayOfWeek: 4 });
    expect(sessionsRepo.update).toHaveBeenCalledWith('s0', { cancelled: true });
    expect(sessionsRepo.delete).not.toHaveBeenCalled();
  });

  it('leaves past sessions, today and sessions already on the new weekday alone', async () => {
    const { service, sessionsRepo } = await buildUpdate([
      { date: '2026-09-15' }, // past Tuesday
      { date: '2026-09-20' }, // today
      { date: '2026-09-24' }, // a Thursday, the new weekday
    ]);
    await service.updateTraining('t1', { dayOfWeek: 4 });
    expect(sessionsRepo.delete).not.toHaveBeenCalled();
    expect(sessionsRepo.update).not.toHaveBeenCalled();
  });

  it("does nothing to sessions when the weekday isn't what changed", async () => {
    const { service, sessionsRepo } = await buildUpdate(tuesdays);
    await service.updateTraining('t1', { location: 'Terrain B' });
    expect(sessionsRepo.delete).not.toHaveBeenCalled();
  });
});

describe('TrainingsService.updateSession — cancelling', () => {
  // Thursday 2026-11-19, 10:00 in Paris; tonight's session is 19:00–20:30.
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-19T09:00:00Z')));
  afterEach(() => jest.useRealTimers());

  async function buildCancel(session: Partial<TrainingSession> = {}) {
    const stored = {
      id: 's1',
      trainingId: 't1',
      date: '2026-11-19',
      startTime: '19:00:00',
      endTime: '20:30:00',
      location: 'Stade',
      cancelled: false,
      cancellationNote: null,
      ...session,
    };
    const sessionsRepo = {
      findOne: jest.fn().mockResolvedValue(stored),
      save: jest.fn((s: unknown) => Promise.resolve(s)),
    };
    const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: getRepositoryToken(Training), useValue: {} },
        { provide: getRepositoryToken(TrainingSession), useValue: sessionsRepo },
        { provide: AttendancesService, useValue: {} },
        {
          provide: getRepositoryToken(Attendance),
          useValue: { find: jest.fn().mockResolvedValue([{ userId: 'absent' }]) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([{ id: 'coach' }, { id: 'p1' }, { id: 'absent' }, { id: 'p1' }]),
          },
        },
        { provide: PushNotificationsService, useValue: push },
      ],
    }).compile();
    return { service: moduleRef.get(TrainingsService), push };
  }

  it("pushes the roster (minus the coach and those who said they're absent) with the note", async () => {
    const { service, push } = await buildCancel();
    const saved = await service.updateSession(
      's1',
      { cancelled: true, cancellationNote: '  Five à 20h au Urban  ' },
      'coach',
    );
    expect(saved.cancellationNote).toBe('Five à 20h au Urban');
    expect(push.sendToUsers).toHaveBeenCalledWith(['p1'], {
      title: 'Entraînement annulé',
      body: "L'entraînement de ce soir (19h00) est annulé. Five à 20h au Urban",
      url: '/trainings?session=s1',
    });
  });

  it('clears the note and announces it when the session is reinstated', async () => {
    const { service, push } = await buildCancel({ cancelled: true, cancellationNote: 'Five' });
    const saved = await service.updateSession('s1', { cancelled: false }, 'coach');
    expect(saved.cancellationNote).toBeNull();
    expect(push.sendToUsers).toHaveBeenCalledWith(
      ['p1'],
      expect.objectContaining({ title: 'Entraînement maintenu' }),
    );
  });

  it("doesn't push for a session that's already over, nor when nothing about cancellation changed", async () => {
    const past = await buildCancel({ date: '2026-11-18' });
    await past.service.updateSession('s1', { cancelled: true }, 'coach');
    expect(past.push.sendToUsers).not.toHaveBeenCalled();

    const unchanged = await buildCancel();
    await unchanged.service.updateSession('s1', { location: 'Terrain B' }, 'coach');
    expect(unchanged.push.sendToUsers).not.toHaveBeenCalled();
  });

  it('still cancels when the push fails', async () => {
    const { service, push } = await buildCancel();
    push.sendToUsers.mockRejectedValue(new Error('push down'));
    await expect(service.updateSession('s1', { cancelled: true }, 'coach')).resolves.toMatchObject({
      cancelled: true,
    });
  });
});
