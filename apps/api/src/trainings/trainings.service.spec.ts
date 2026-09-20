import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrainingsService } from './trainings.service';
import { Training, TrainingType } from './entities/training.entity';
import { TrainingSession } from './entities/training-session.entity';
import { AttendancesService } from '../attendances/attendances.service';

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
