import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendancesService } from './attendances.service';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { TrainingTeamAssignment } from '../team-balancing/entities/training-team-assignment.entity';
import { User } from '../users/entities/user.entity';

type Row = Partial<Attendance> & { userId: string };

async function build(opts: {
  sessionDate: string;
  startTime?: string;
  cap?: number | null;
  attendances?: Row[];
  assignments?: { userId: string; teamIndex: number }[];
}) {
  const attendances: Row[] = (opts.attendances ?? []).map((a) => ({
    trainingSessionId: 's1',
    status: AttendanceStatus.PRESENT,
    confirmed: true,
    confirmedGuestCount: 0,
    guestCount: 0,
    actualStatus: null,
    respondedAt: new Date(),
    user: { isLicensed: false, seniorityTier: null } as User,
    ...a,
  }));
  const assignments = [...(opts.assignments ?? [])];
  const session = {
    id: 's1',
    date: opts.sessionDate,
    startTime: opts.startTime ?? '19:00',
    maxPresentPlayersOverride: opts.cap ?? null,
    training: { maxPresentPlayers: null },
  };
  const attendancesRepo = {
    findOne: jest.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        attendances.find((a) => a.userId === where.userId) ?? null,
      ),
    ),
    find: jest.fn(() => Promise.resolve(attendances)),
    create: jest.fn((a: Row) => ({ confirmedGuestCount: 0, ...a })),
    save: jest.fn((a: Row) => {
      if (!attendances.includes(a)) attendances.push(a);
      return Promise.resolve(a);
    }),
  };
  const assignmentsRepo = {
    find: jest.fn(() => Promise.resolve(assignments)),
    delete: jest.fn(({ userId }: { userId: string }) => {
      const i = assignments.findIndex((x) => x.userId === userId);
      if (i >= 0) assignments.splice(i, 1);
      return Promise.resolve();
    }),
    create: jest.fn((a: { userId: string; teamIndex: number }) => a),
    save: jest.fn((a: { userId: string; teamIndex: number }) => {
      assignments.push(a);
      return Promise.resolve(a);
    }),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AttendancesService,
      { provide: getRepositoryToken(Attendance), useValue: attendancesRepo },
      {
        provide: getRepositoryToken(AttendanceGuest),
        useValue: {
          delete: jest.fn().mockResolvedValue(undefined),
          save: jest.fn((g: unknown[]) => Promise.resolve(g)),
          create: jest.fn((g: unknown) => g),
        },
      },
      {
        provide: getRepositoryToken(AttendanceStatusChange),
        useValue: {
          save: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((c: unknown) => c),
        },
      },
      {
        provide: getRepositoryToken(TrainingSession),
        useValue: { findOne: jest.fn().mockResolvedValue(session) },
      },
      {
        provide: getRepositoryToken(User),
        useValue: {
          findOne: jest
            .fn()
            .mockResolvedValue({ isLicensed: false, seniorityTier: null }),
        },
      },
      {
        provide: getRepositoryToken(TrainingTeamAssignment),
        useValue: assignmentsRepo,
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(AttendancesService),
    attendances,
    assignments,
  };
}

describe('AttendancesService.setAttendance', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T10:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('confirms a PRESENT answer when the session has no cap', async () => {
    const { service } = await build({ sessionDate: '2026-09-22' });
    const a = await service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT);
    expect(a.status).toBe(AttendanceStatus.PRESENT);
    expect(a.confirmed).toBe(true);
  });

  it('refuses a change once the session has started', async () => {
    const { service } = await build({
      sessionDate: '2026-09-20',
      startTime: '10:00',
    });
    jest.setSystemTime(new Date('2026-09-25T10:00:00Z')); // five days after kickoff
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets the coach override the lock', async () => {
    const { service } = await build({ sessionDate: '2026-09-01' });
    const a = await service.setAttendance(
      's1',
      'u1',
      AttendanceStatus.PRESENT,
      [],
      true,
      'coach',
    );
    expect(a.status).toBe(AttendanceStatus.PRESENT);
  });

  it('waitlists a newcomer when the cap is already full', async () => {
    const { service } = await build({
      sessionDate: '2026-09-22',
      cap: 2,
      attendances: [
        { userId: 'a', respondedAt: new Date('2026-09-19') },
        { userId: 'b', respondedAt: new Date('2026-09-19') },
      ],
    });
    const c = await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
    expect(c.confirmed).toBe(false);
  });

  it('confirms a newcomer while there is still room', async () => {
    const { service } = await build({
      sessionDate: '2026-09-22',
      cap: 3,
      attendances: [{ userId: 'a' }, { userId: 'b' }],
    });
    const c = await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
    expect(c.confirmed).toBe(true);
  });

  it('places a late PRESENT on the smallest team once teams exist', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-09-22',
      assignments: [
        { userId: 'a', teamIndex: 0 },
        { userId: 'b', teamIndex: 0 },
        { userId: 'c', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'late', AttendanceStatus.PRESENT);
    expect(assignments.find((x) => x.userId === 'late')?.teamIndex).toBe(1);
  });

  it('does nothing to teams when none were generated yet', async () => {
    const { service, assignments } = await build({ sessionDate: '2026-09-22' });
    await service.setAttendance('s1', 'late', AttendanceStatus.PRESENT);
    expect(assignments).toHaveLength(0);
  });

  it('takes a player off their team when they turn ABSENT', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-09-22',
      attendances: [{ userId: 'a' }],
      assignments: [
        { userId: 'a', teamIndex: 0 },
        { userId: 'b', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'a', AttendanceStatus.ABSENT);
    expect(assignments.map((x) => x.userId)).toEqual(['b']);
  });

  it('does not put a waitlisted player on a team', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-09-22',
      cap: 1,
      attendances: [{ userId: 'a', respondedAt: new Date('2026-09-19') }],
      assignments: [{ userId: 'a', teamIndex: 0 }],
    });
    const b = await service.setAttendance('s1', 'b', AttendanceStatus.PRESENT);
    expect(b.confirmed).toBe(false);
    expect(assignments.some((x) => x.userId === 'b')).toBe(false);
  });

  it('caps confirmed guests to the remaining places', async () => {
    const { service } = await build({
      sessionDate: '2026-09-22',
      cap: 3,
      attendances: [{ userId: 'a' }],
    });
    const b = await service.setAttendance('s1', 'b', AttendanceStatus.PRESENT, [
      { firstName: 'G1' },
      { firstName: 'G2' },
      { firstName: 'G3' },
    ]);
    // cap 3 − a(1) − b(1) = 1 place left for guests
    expect(b.confirmedGuestCount).toBe(1);
    expect(b.guestCount).toBe(3);
  });
});
