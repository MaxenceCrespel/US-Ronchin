import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttendancesService } from './attendances.service';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { AttendanceGuest } from './entities/attendance-guest.entity';
import { FindOperator } from 'typeorm';
import { AttendanceStatusChange } from './entities/attendance-status-change.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { TrainingTeamAssignment } from '../team-balancing/entities/training-team-assignment.entity';
import { User } from '../users/entities/user.entity';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { sessionLockProvider } from '../test-utils/session-lock-mock';

type Row = Partial<Attendance> & { userId: string };

async function build(opts: {
  sessionDate: string;
  startTime?: string;
  cap?: number | null;
  attendances?: Row[];
  assignments?: Record<string, unknown>[];
  endTime?: string;
  cancelled?: boolean;
  separationRules?: { userAId: string; userBId: string }[];
}) {
  const attendances: Row[] = (opts.attendances ?? []).map((a) => ({
    id: `att-${a.userId}`,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignments: any[] = (opts.assignments ?? []).map((a, i) => ({ id: `as${i}`, ...a }));
  const session = {
    id: 's1',
    date: opts.sessionDate,
    startTime: opts.startTime ?? '19:00',
    endTime: opts.endTime ?? '22:00',
    cancelled: opts.cancelled ?? false,
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
    create: jest.fn((a: Row) => ({ id: `att-${a.userId}`, confirmedGuestCount: 0, ...a })),
    save: jest.fn((a: Row) => {
      if (!attendances.includes(a)) attendances.push(a);
      return Promise.resolve(a);
    }),
  };
  const assignmentsRepo = {
    find: jest.fn(() => Promise.resolve(assignments)),
    delete: jest.fn((criteria: unknown) => {
      const matches = (x: Record<string, unknown>): boolean => {
        if (Array.isArray(criteria)) return criteria.includes(x.id);
        // Rows in this mock all belong to the one session, so that key never discriminates.
        return Object.entries(criteria as Record<string, unknown>).every(([k, v]) =>
          k === 'trainingSessionId' ||
          (v instanceof FindOperator ? (v.value as unknown[]).includes(x[k]) : x[k] === v),
        );
      };
      for (let i = assignments.length - 1; i >= 0; i--) {
        if (matches(assignments[i])) assignments.splice(i, 1);
      }
      return Promise.resolve();
    }),
    create: jest.fn((a: Record<string, unknown>) => ({ id: `as-new-${assignments.length}`, ...a })),
    save: jest.fn((a: Record<string, unknown>) => {
      if (!assignments.includes(a)) assignments.push(a);
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
          find: jest.fn(({ where }: { where: { attendanceId: string } }) =>
            Promise.resolve(attendances.find((a) => a.id === where.attendanceId)?.guests ?? []),
          ),
          delete: jest.fn((ids: string[]) => {
            for (const a of attendances) a.guests = (a.guests ?? []).filter((g) => !ids.includes(g.id));
            return Promise.resolve();
          }),
          save: jest.fn((list: AttendanceGuest[]) => {
            list.forEach((g, i) => (g.id ??= `g-new-${g.attendanceId}-${i}-${g.firstName}`));
            const row = attendances.find((a) => a.id === list[0]?.attendanceId);
            if (row) {
              const kept = (row.guests ?? []).filter((g) => !list.some((x) => x.id === g.id));
              row.guests = [...kept, ...list];
            }
            return Promise.resolve(list);
          }),
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
      {
        provide: getRepositoryToken(PlayerSeparationRule),
        useValue: { find: jest.fn().mockResolvedValue(opts.separationRules ?? []) },
      },
      sessionLockProvider([
        Attendance,
        AttendanceGuest,
        AttendanceStatusChange,
        TrainingSession,
        User,
        TrainingTeamAssignment,
        PlayerSeparationRule,
      ]),
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

  it("puts a waitlisted guest on a team when a player's withdrawal frees their place", async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-09-22',
      cap: 3,
      attendances: [
        { userId: 'logan' },
        { userId: 'a' },
        {
          userId: 'host',
          user: { firstName: 'Host', isLicensed: false, seniorityTier: null } as User,
          guestCount: 1,
          confirmedGuestCount: 0,
          guests: [{ id: 'g1', firstName: 'Yacine', lastName: 'Djemai', position: null }],
        } as Row,
      ],
      assignments: [
        { userId: 'logan', teamIndex: 0 },
        { userId: 'a', teamIndex: 1 },
        { userId: 'host', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'logan', AttendanceStatus.ABSENT);
    expect(assignments.some((x) => x.userId === 'logan')).toBe(false);
    const yacine = assignments.find(
      (x) => (x as { guestLabel?: string }).guestLabel === 'Yacine Djemai',
    );
    expect(yacine).toBeDefined();
    expect(yacine!.teamIndex).toBe(0);
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

  describe('guests rank below every player with an account', () => {
    it('gives a guest place to a newcomer instead of waitlisting them', async () => {
      const { service, attendances } = await build({
        sessionDate: '2026-09-22',
        cap: 3,
        attendances: [
          { userId: 'a', guestCount: 1, confirmedGuestCount: 1 },
          { userId: 'b' },
        ],
      });
      const c = await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
      expect(c.confirmed).toBe(true);
      // a keeps their own place, only the guest gave way
      const a = attendances.find((x) => x.userId === 'a')!;
      expect(a.confirmed).toBe(true);
      expect(a.confirmedGuestCount).toBe(0);
      expect(a.guestCount).toBe(1);
    });

    it("doesn't let a guest inherit a licensed, senior inviter's priority", async () => {
      const { service, attendances } = await build({
        sessionDate: '2026-09-22',
        cap: 3,
        attendances: [
          {
            userId: 'a',
            guestCount: 1,
            confirmedGuestCount: 1,
            user: { isLicensed: true, seniorityTier: 'SEVEN_PLUS' } as User,
          },
          { userId: 'b' },
        ],
      });
      // c has no licence and no seniority (rank 0) — still outranks a's guest
      const c = await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
      expect(c.confirmed).toBe(true);
      expect(attendances.find((x) => x.userId === 'a')!.confirmedGuestCount).toBe(0);
    });

    it('bumps the most recently declared guest first', async () => {
      const { service, attendances } = await build({
        sessionDate: '2026-09-22',
        cap: 3,
        attendances: [
          {
            userId: 'early',
            guestCount: 1,
            confirmedGuestCount: 1,
            respondedAt: new Date('2026-09-18'),
          },
          {
            userId: 'late',
            guestCount: 1,
            confirmedGuestCount: 1,
            respondedAt: new Date('2026-09-19'),
          },
        ],
      });
      // early is ABSENT but their guest still holds a place (a guest counts regardless of
      // the inviter's own status): early 0+1, late 1+1 = 3 = cap, so the session is full.
      attendances.find((x) => x.userId === 'early')!.status = AttendanceStatus.ABSENT;
      const c = await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
      expect(c.confirmed).toBe(true);
      expect(attendances.find((x) => x.userId === 'late')!.confirmedGuestCount).toBe(0);
      expect(attendances.find((x) => x.userId === 'early')!.confirmedGuestCount).toBe(1);
    });

    it("never lets an arriving player's own guest bump anyone", async () => {
      const { service, attendances } = await build({
        sessionDate: '2026-09-22',
        cap: 2,
        attendances: [{ userId: 'a', guestCount: 1, confirmedGuestCount: 1 }],
      });
      // Full (a + a's guest). b takes a's guest's place, but b's own guest finds nothing left
      // and stays unconfirmed — a guest never bumps another guest, or a player.
      const b = await service.setAttendance('s1', 'b', AttendanceStatus.PRESENT, [
        { firstName: 'G' },
      ]);
      expect(b.confirmed).toBe(true);
      expect(b.confirmedGuestCount).toBe(0);
      expect(b.guestCount).toBe(1);
      expect(attendances.find((x) => x.userId === 'a')!.confirmedGuestCount).toBe(0);
    });

    it('promotes waitlisted players before any guest, guests of the promoted one included', async () => {
      const { service, attendances } = await build({
        sessionDate: '2026-09-22',
        cap: 4,
        attendances: [
          { userId: 'x' },
          { userId: 'y', guestCount: 1, confirmedGuestCount: 1 },
          { userId: 'z' },
          {
            userId: 'b',
            confirmed: false,
            guestCount: 1,
            user: { isLicensed: true, seniorityTier: null } as User,
          },
          { userId: 'd', confirmed: false },
        ],
      });
      // y turns ABSENT and drops the guest too: frees 2 places (y's own + the guest)
      await service.setAttendance('s1', 'y', AttendanceStatus.ABSENT);
      const b = attendances.find((x) => x.userId === 'b')!;
      const d = attendances.find((x) => x.userId === 'd')!;
      expect(b.confirmed).toBe(true);
      expect(d.confirmed).toBe(true);
      expect(b.confirmedGuestCount).toBe(0); // b's guest waits behind every waitlisted player
    });
  });
});

const user = (o: Record<string, unknown> = {}) =>
  ({ firstName: 'Host', isLicensed: false, seniorityTier: null, ...o }) as unknown as User;

describe('AttendancesService — lock, queue and cap', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('locks at the real Paris kickoff, not at the same wall-clock time in UTC', async () => {
    // 20:30 Paris on 27 Oct (CET, UTC+1) is 19:30 UTC; it is 19:45 UTC, i.e. 15 min after kickoff.
    jest.setSystemTime(new Date('2026-10-27T19:45:00Z'));
    const { service } = await build({ sessionDate: '2026-10-27', startTime: '20:30:00' });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still accepts an answer before the Paris kickoff', async () => {
    jest.setSystemTime(new Date('2026-10-27T19:00:00Z'));
    const { service } = await build({ sessionDate: '2026-10-27', startTime: '20:30:00' });
    await expect(service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT)).resolves.toBeDefined();
  });

  it('clears the waitlist when the cap is removed altogether', async () => {
    jest.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: null,
      attendances: [
        { userId: 'w', confirmed: false },
        { userId: 'g', guestCount: 2, confirmedGuestCount: 0 },
      ],
    });
    await service.syncCapPromotions('s1');
    expect(attendances.find((a) => a.userId === 'w')!.confirmed).toBe(true);
    expect(attendances.find((a) => a.userId === 'g')!.confirmedGuestCount).toBe(2);
  });

  it('keeps a waitlisted player at their place in the queue when they re-submit PRESENT', async () => {
    jest.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 1,
      attendances: [
        { userId: 'a' },
        { userId: 'b', confirmed: false, respondedAt: new Date('2026-10-27T08:00:00Z') },
        { userId: 'c', confirmed: false, respondedAt: new Date('2026-10-27T09:00:00Z') },
      ],
    });
    await service.setAttendance('s1', 'b', AttendanceStatus.PRESENT, [{ firstName: 'G' }]);
    await service.setAttendance('s1', 'a', AttendanceStatus.ABSENT);
    expect(attendances.find((a) => a.userId === 'b')!.confirmed).toBe(true);
    expect(attendances.find((a) => a.userId === 'c')!.confirmed).toBe(false);
  });

  it('sends a player to the back of the queue when they actually change their answer', async () => {
    jest.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 1,
      attendances: [
        { userId: 'a' },
        { userId: 'b', confirmed: false, respondedAt: new Date('2026-10-27T08:00:00Z') },
        { userId: 'c', confirmed: false, respondedAt: new Date('2026-10-27T09:00:00Z') },
      ],
    });
    await service.setAttendance('s1', 'b', AttendanceStatus.ABSENT);
    await service.setAttendance('s1', 'b', AttendanceStatus.PRESENT);
    await service.setAttendance('s1', 'a', AttendanceStatus.ABSENT);
    expect(attendances.find((a) => a.userId === 'c')!.confirmed).toBe(true);
    expect(attendances.find((a) => a.userId === 'b')!.confirmed).toBe(false);
  });
});

describe('AttendancesService — guests follow the teams', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-27T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  const hostWithGuest = (extra: Record<string, unknown> = {}) =>
    ({
      userId: 'host',
      user: user(),
      guestCount: 1,
      confirmedGuestCount: 1,
      guests: [{ id: 'g1', firstName: 'Yacine', lastName: 'Djemai', sortOrder: 0 }],
      ...extra,
    }) as Row;

  it('takes a guest off their team when an arriving player bumps them', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 2,
      attendances: [hostWithGuest()],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: null, guestLabel: 'Yacine Djemai', attendanceGuestId: 'g1', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'newbie', AttendanceStatus.PRESENT);
    expect(assignments.some((a) => a.guestLabel === 'Yacine Djemai')).toBe(false);
  });

  it("takes a player's guests off the teams when a higher-ranked player waitlists them", async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 2,
      attendances: [hostWithGuest()],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: null, guestLabel: 'Yacine Djemai', attendanceGuestId: 'g1', teamIndex: 1 },
      ],
    });
    // The only holder of a place besides the guest is the host: a licensed arrival with no guest
    // to bump first would take the guest's place before touching any player.
    await service.setAttendance('s1', 'licensed', AttendanceStatus.PRESENT);
    expect(assignments.some((a) => a.userId === 'host')).toBe(true);
    expect(assignments.some((a) => a.guestLabel === 'Yacine Djemai')).toBe(false);
  });

  it('puts a guest the player adds after generation on a team', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 10,
      attendances: [{ userId: 'host', user: user() }],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: 'other', teamIndex: 0 },
        { userId: 'third', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'host', AttendanceStatus.PRESENT, [{ firstName: 'Karim' }]);
    const slot = assignments.find((a) => a.guestLabel === 'Karim');
    expect(slot).toBeDefined();
    expect(slot!.teamIndex).toBe(1);
  });

  it('takes a guest the player removes off their team', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 10,
      attendances: [hostWithGuest()],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: null, guestLabel: 'Yacine Djemai', attendanceGuestId: 'g1', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'host', AttendanceStatus.PRESENT, []);
    expect(assignments.some((a) => a.guestLabel === 'Yacine Djemai')).toBe(false);
  });

  it('keeps the same guest id, and a single team slot, when the list is re-saved', async () => {
    const { service, assignments, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 10,
      attendances: [hostWithGuest()],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: null, guestLabel: 'Yacine Djemai', attendanceGuestId: 'g1', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'host', AttendanceStatus.PRESENT, [
      { firstName: 'Yacine', lastName: 'Djemai' },
      { firstName: 'Karim' },
    ]);
    const host = attendances.find((a) => a.userId === 'host')!;
    expect(host.guests!.find((g) => g.firstName === 'Yacine')!.id).toBe('g1');
    expect(assignments.filter((a) => a.guestLabel === 'Yacine Djemai')).toHaveLength(1);
    expect(assignments.some((a) => a.guestLabel === 'Karim')).toBe(true);
  });

  it("doesn't wipe a guest's declared position when the client re-sends names only", async () => {
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 10,
      attendances: [
        hostWithGuest({
          guests: [{ id: 'g1', firstName: 'Yacine', lastName: 'Djemai', sortOrder: 0, position: 'GOALKEEPER' }],
        }),
      ],
    });
    await service.setAttendance('s1', 'host', AttendanceStatus.PRESENT, [
      { firstName: 'Yacine', lastName: 'Djemai' },
    ]);
    expect(attendances.find((a) => a.userId === 'host')!.guests![0].position).toBe('GOALKEEPER');
  });

  it('places two different guests that share the same label', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 5,
      attendances: [
        { userId: 'leaver' },
        { userId: 'a' },
        {
          userId: 'other',
          user: user({ firstName: 'Other' }),
          guestCount: 1,
          confirmedGuestCount: 1,
          guests: [{ id: 'g-other', firstName: 'Karim', sortOrder: 0 }],
        } as Row,
        {
          userId: 'host',
          user: user(),
          guestCount: 1,
          confirmedGuestCount: 0,
          guests: [{ id: 'g2', firstName: 'Karim', sortOrder: 0 }],
        } as Row,
      ],
      assignments: [
        { userId: 'leaver', teamIndex: 0 },
        { userId: 'a', teamIndex: 1 },
        { userId: null, guestLabel: 'Karim', attendanceGuestId: 'g-other', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'leaver', AttendanceStatus.ABSENT);
    expect(assignments.filter((a) => a.guestLabel === 'Karim')).toHaveLength(2);
  });

  it('re-links a slot generated before guest ids were stable instead of duplicating it', async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      cap: 10,
      attendances: [hostWithGuest()],
      assignments: [
        { userId: 'host', teamIndex: 0 },
        { userId: null, guestLabel: 'Yacine Djemai', attendanceGuestId: 'long-gone-id', teamIndex: 1 },
      ],
    });
    await service.setAttendance('s1', 'host', AttendanceStatus.PRESENT, [
      { firstName: 'Yacine', lastName: 'Djemai' },
    ]);
    const slots = assignments.filter((a) => a.guestLabel === 'Yacine Djemai');
    expect(slots).toHaveLength(1);
    expect(slots[0].attendanceGuestId).toBe('g1');
  });
});

describe('AttendancesService — cancelled and finished sessions', () => {
  afterEach(() => jest.useRealTimers());

  it('refuses an answer for a cancelled session', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T10:00:00Z'));
    const { service } = await build({ sessionDate: '2026-10-27', cancelled: true });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // 20:30–22:00 Paris on 27 Oct (CET): 19:30Z–21:00Z.
  const evening = { sessionDate: '2026-10-27', startTime: '20:30', endTime: '22:00' };

  it('still lets a player add a guest while the session is under way', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T20:00:00Z')); // 21:00 Paris
    const { service } = await build({ ...evening, attendances: [{ userId: 'u1', user: user() }] });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT, [{ firstName: 'Ami' }]),
    ).resolves.toBeDefined();
  });

  it('refuses any change once the session is over, guest lists included', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T21:30:00Z')); // 22:30 Paris
    const { service } = await build({ ...evening, attendances: [{ userId: 'u1', user: user() }] });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT, [{ firstName: 'Ami' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still lets the coach correct a finished session', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T09:00:00Z'));
    const { service } = await build({ ...evening, attendances: [{ userId: 'u1', user: user() }] });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.ABSENT, [], true, 'coach'),
    ).resolves.toBeDefined();
  });

  it('treats an end time before the start time as the next morning', async () => {
    // 23:00–01:00 Paris: at 00:30 Paris on the 28th the session is still going.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-27T23:30:00Z'));
    const { service } = await build({
      sessionDate: '2026-10-27',
      startTime: '23:00',
      endTime: '01:00',
      attendances: [{ userId: 'u1', user: user() }],
    });
    await expect(
      service.setAttendance('s1', 'u1', AttendanceStatus.PRESENT, [{ firstName: 'Ami' }]),
    ).resolves.toBeDefined();
  });
});

describe('AttendancesService — a place the coach gave back', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-27T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it("doesn't count a player marked absent for real against the cap", async () => {
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 2,
      attendances: [
        { userId: 'removed', actualStatus: AttendanceStatus.ABSENT },
        { userId: 'b' },
      ],
    });
    await service.setAttendance('s1', 'c', AttendanceStatus.PRESENT);
    expect(attendances.find((a) => a.userId === 'c')!.confirmed).toBe(true);
  });

  it('promotes the waitlist into a place freed that way', async () => {
    const { service, attendances } = await build({
      sessionDate: '2026-10-28',
      cap: 2,
      attendances: [
        { userId: 'removed', actualStatus: AttendanceStatus.ABSENT },
        { userId: 'b' },
        { userId: 'waiting', confirmed: false },
      ],
    });
    await service.syncCapPromotions('s1');
    expect(attendances.find((a) => a.userId === 'waiting')!.confirmed).toBe(true);
  });
});

describe('AttendancesService — late arrivals and separation rules', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-27T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  const teams = [
    { userId: 'karim', teamIndex: 0 },
    { userId: 'x', teamIndex: 0 },
    { userId: 'y', teamIndex: 1 },
    { userId: 'z', teamIndex: 1 },
  ];

  it("doesn't put a late arrival on the team of someone they must never play with", async () => {
    const { service, assignments } = await build({
      sessionDate: '2026-10-28',
      assignments: teams,
      separationRules: [{ userAId: 'bilal', userBId: 'karim' }],
    });
    await service.setAttendance('s1', 'bilal', AttendanceStatus.PRESENT);
    expect(assignments.find((a) => a.userId === 'bilal')!.teamIndex).toBe(1);
  });

  it('falls back to the smallest team when there is no rule', async () => {
    const { service, assignments } = await build({ sessionDate: '2026-10-28', assignments: teams });
    await service.setAttendance('s1', 'bilal', AttendanceStatus.PRESENT);
    expect(assignments.find((a) => a.userId === 'bilal')!.teamIndex).toBe(0);
  });
});
