import { TeamBalancingService } from './team-balancing.service';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { manualSessionLock } from '../test-utils/session-lock-mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
function build(opts: { assignments: any[]; attendances: any[]; sessions?: any[]; rules?: any[]; session?: any }) {
  const assignments: any[] = [...opts.assignments];
  const attendances: any[] = opts.attendances.map((a) => ({
    trainingSessionId: 's1',
    actualStatus: null,
    confirmed: true,
    confirmedGuestCount: 0,
    ...a,
  }));
  let n = 0;
  const assignmentsRepo = {
    find: jest.fn(() => Promise.resolve(assignments)),
    count: jest.fn(() => Promise.resolve(assignments.length)),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(assignments.find((a) => a.id === where.id) ?? null),
    ),
    delete: jest.fn((arg: any) => {
      const ids: string[] = Array.isArray(arg) ? arg : typeof arg === 'string' ? [arg] : [];
      if (!ids.length && arg?.trainingSessionId) assignments.splice(0, assignments.length);
      for (const id of ids) {
        const i = assignments.findIndex((a) => a.id === id);
        if (i >= 0) assignments.splice(i, 1);
      }
      return Promise.resolve();
    }),
    create: jest.fn((a: any) => ({ id: `n${n++}`, ...a })),
    save: jest.fn((a: any) => {
      for (const x of Array.isArray(a) ? a : [a]) assignments.push(x);
      return Promise.resolve(a);
    }),
  };
  const attendancesRepo = {
    find: jest.fn(() => Promise.resolve(attendances)),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(attendances.find((a) => a.userId === where.userId) ?? null),
    ),
    update: jest.fn(({ userId }: any, patch: any) => {
      Object.assign(attendances.find((a) => a.userId === userId) ?? {}, patch);
      return Promise.resolve();
    }),
    create: jest.fn((a: any) => ({ confirmed: true, confirmedGuestCount: 0, actualStatus: null, ...a })),
    save: jest.fn((a: any) => {
      if (!attendances.includes(a)) attendances.push(a);
      return Promise.resolve(a);
    }),
    decrement: jest.fn().mockResolvedValue(undefined),
  };
  const sessionsRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 's1', date: '2026-10-27', ...(opts.session ?? {}) }),
    find: jest.fn().mockResolvedValue(opts.sessions ?? []),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const guestsRepo = { findOne: jest.fn().mockResolvedValue(null), delete: jest.fn() };
  const rulesRepo = { find: jest.fn().mockResolvedValue(opts.rules ?? []) };
  const attendancesService = { syncCapPromotions: jest.fn().mockResolvedValue(undefined) };
  const lock = manualSessionLock([
    [TrainingTeamAssignment, assignmentsRepo],
    [TrainingSession, sessionsRepo],
    [Attendance, attendancesRepo],
    [AttendanceGuest, guestsRepo],
    [PlayerSeparationRule, rulesRepo],
  ]);
  const service = new TeamBalancingService(
    assignmentsRepo as any,
    sessionsRepo as any,
    attendancesRepo as any,
    guestsRepo as any,
    rulesRepo as any,
    {} as any,
    {} as any,
    lock as any,
    attendancesService as any,
  );
  return { service, assignments, attendances, attendancesRepo, guestsRepo, sessionsRepo, attendancesService };
}

describe('TeamBalancingService — regressions', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps a player the coach removed and then re-added through confirmFinalTeams', async () => {
    const { service, assignments } = build({
      assignments: [
        { id: 'x', userId: 'p', teamIndex: 0 },
        { id: 'y', userId: 'q', teamIndex: 1 },
      ],
      attendances: [
        { userId: 'p', status: AttendanceStatus.PRESENT },
        { userId: 'q', status: AttendanceStatus.PRESENT },
      ],
    });
    await service.removeFromTeam('s1', 'x');
    await service.addPlayerToTeam('s1', 'p');
    expect(assignments.some((a) => a.userId === 'p')).toBe(true);
    await service.confirmFinalTeams('s1');
    expect(assignments.some((a) => a.userId === 'p')).toBe(true);
  });

  it('confirmFinalTeams does not add a waitlisted (never confirmed) player as a newcomer', async () => {
    const { service, assignments } = build({
      assignments: [{ id: 'y', userId: 'q', teamIndex: 1 }],
      attendances: [
        { userId: 'q', status: AttendanceStatus.PRESENT },
        { userId: 'w', status: AttendanceStatus.PRESENT, confirmed: false },
      ],
    });
    await service.confirmFinalTeams('s1');
    expect(assignments.some((a) => a.userId === 'w')).toBe(false);
  });

  it('promotes a waitlisted player the coach adds to a team, so he counts against the cap', async () => {
    const { service, attendances } = build({
      assignments: [{ id: 'y', userId: 'q', teamIndex: 1 }],
      attendances: [{ userId: 'w', status: AttendanceStatus.PRESENT, confirmed: false }],
    });
    await service.addPlayerToTeam('s1', 'w');
    expect(attendances.find((a) => a.userId === 'w')!.confirmed).toBe(true);
  });

  describe('auto-generation window', () => {
    const session = (extra: Record<string, unknown> = {}) => ({
      id: 's1',
      date: '2026-10-27',
      startTime: '19:00:00',
      ...extra,
    });

    it('picks a session without teams inside the window', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-27T17:50:00Z')); // 18:50 Paris
      const { service } = build({ assignments: [], attendances: [], sessions: [session()] });
      expect(await service.findUpcomingSessionsNeedingTeams()).toHaveLength(1);
    });

    it('leaves alone a session whose teams the coach deleted on purpose', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-27T17:50:00Z'));
      const { service } = build({
        assignments: [],
        attendances: [],
        sessions: [session({ teamsAutoGenerationDisabled: true })],
      });
      expect(await service.findUpcomingSessionsNeedingTeams()).toHaveLength(0);
    });

    it('deleteTeams records that choice on the session', async () => {
      const { service, assignments, sessionsRepo } = build({
        assignments: [{ id: 'y', userId: 'q', teamIndex: 1 }],
        attendances: [],
      });
      await service.deleteTeams('s1');
      expect(assignments).toHaveLength(0);
      expect(sessionsRepo.update).toHaveBeenCalledWith('s1', { teamsAutoGenerationDisabled: true });
    });
  });

  it('removing a guest whose slot points at a recreated row still frees their headcount', async () => {
    const { service, attendancesRepo, guestsRepo } = build({
      assignments: [
        { id: 'g', userId: null, attendanceGuestId: 'stale-id', guestLabel: 'Karim', teamIndex: 1 },
      ],
      attendances: [
        {
          userId: 'host',
          user: { firstName: 'Host' },
          status: AttendanceStatus.PRESENT,
          guestCount: 1,
          confirmedGuestCount: 1,
          id: 'att-host',
          guests: [{ id: 'current-id', attendanceId: 'att-host', firstName: 'Karim', lastName: null, sortOrder: 0 }],
        },
      ],
    });
    await service.removeFromTeam('s1', 'g');
    expect(guestsRepo.delete).toHaveBeenCalledWith('current-id');
    expect(attendancesRepo.decrement).toHaveBeenCalledWith({ id: 'att-host' }, 'guestCount', 1);
    expect(attendancesRepo.decrement).toHaveBeenCalledWith({ id: 'att-host' }, 'confirmedGuestCount', 1);
  });

  describe('cancelled sessions', () => {
    const cancelled = { session: { cancelled: true }, assignments: [{ id: 'y', userId: 'q', teamIndex: 1 }], attendances: [] };

    it('refuses to generate teams', async () => {
      const { service } = build({ ...cancelled, assignments: [] });
      await expect(service.generateTeams('s1')).rejects.toThrow('annulé');
    });

    it('refuses to add a walk-in or a player', async () => {
      const { service } = build(cancelled);
      await expect(service.addWalkIn('s1', { firstName: 'Karim' })).rejects.toThrow('annulé');
      await expect(service.addPlayerToTeam('s1', 'p')).rejects.toThrow('annulé');
    });
  });

  describe('automatic generation re-check under the lock', () => {
    it('does nothing when the teams were generated in the meantime', async () => {
      const { service, assignments } = build({
        assignments: [{ id: 'y', userId: 'q', teamIndex: 1 }],
        attendances: [],
      });
      // The stats service is an empty object: reaching the real generation would throw.
      await expect(service.generateTeams('s1', 2, { onlyIfMissing: true })).resolves.toBeDefined();
      expect(assignments).toHaveLength(1);
    });

    it('does nothing when the coach wiped the teams in the meantime', async () => {
      const { service } = build({
        assignments: [],
        attendances: [],
        session: { teamsAutoGenerationDisabled: true },
      });
      await expect(service.generateTeams('s1', 2, { onlyIfMissing: true })).resolves.toEqual([]);
    });
  });

  it('hands the place a removed player or guest frees to the waitlist', async () => {
    const { service, attendancesService } = build({
      assignments: [{ id: 'x', userId: 'p', teamIndex: 0 }],
      attendances: [{ userId: 'p', status: AttendanceStatus.PRESENT }],
    });
    await service.removeFromTeam('s1', 'x');
    expect(attendancesService.syncCapPromotions).toHaveBeenCalledWith('s1');
  });

  describe('separation rules for people added after generation', () => {
    const teams = [
      { id: 'a1', userId: 'karim', teamIndex: 0 },
      { id: 'a2', userId: 'x', teamIndex: 0 },
      { id: 'a3', userId: 'y', teamIndex: 1 },
      { id: 'a4', userId: 'z', teamIndex: 1 },
    ];
    const rules = [{ userAId: 'bilal', userBId: 'karim' }];

    it('the coach adding a player keeps him away from his separated partner', async () => {
      const { service, assignments } = build({ assignments: teams, attendances: [], rules });
      await service.addPlayerToTeam('s1', 'bilal');
      expect(assignments.find((a) => a.userId === 'bilal')!.teamIndex).toBe(1);
    });

    it('the final reconciliation does too', async () => {
      const { service, assignments } = build({
        assignments: teams,
        attendances: [
          { userId: 'karim', status: AttendanceStatus.PRESENT },
          { userId: 'x', status: AttendanceStatus.PRESENT },
          { userId: 'y', status: AttendanceStatus.PRESENT },
          { userId: 'z', status: AttendanceStatus.PRESENT },
          { userId: 'bilal', status: AttendanceStatus.PRESENT, actualStatus: AttendanceStatus.PRESENT },
        ],
        rules,
      });
      await service.confirmFinalTeams('s1');
      expect(assignments.find((a) => a.userId === 'bilal')!.teamIndex).toBe(1);
    });
  });
});
