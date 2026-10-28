import { TeamBalancingService } from './team-balancing.service';
import { AttendanceStatus } from '../attendances/entities/attendance.entity';
import { PlayerSubPosition } from '../users/entities/user.entity';

/* eslint-disable @typescript-eslint/no-explicit-any */
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const POS = Object.values(PlayerSubPosition);

function run(nPlayers: number, guestsPer: number[], nRules: number, teamCount: number, flagged = false) {
  const sessionUpdate = jest.fn().mockResolvedValue(undefined);
  const users = Array.from({ length: nPlayers }, (_, i) => ({
    id: `u${i}`,
    firstName: `P${i}`,
    positions: rnd() < 0.2 ? [] : [pick(POS), ...(rnd() < 0.4 ? [pick(POS)] : [])],
  }));
  const attendances: any[] = users.map((u, i) => ({
    userId: u.id,
    user: u,
    status: AttendanceStatus.PRESENT,
    confirmed: true,
    actualStatus: null,
    confirmedGuestCount: guestsPer[i] ?? 0,
    guests: Array.from({ length: guestsPer[i] ?? 0 }, (_, g) => ({
      id: `g${i}-${g}`,
      firstName: `G${i}${g}`,
      lastName: null,
      position: rnd() < 0.5 ? pick(POS) : null,
    })),
  }));
  const rules = Array.from({ length: users.length >= 2 ? nRules : 0 }, () => {
    const a = pick(users).id;
    let b = pick(users).id;
    while (b === a && users.length > 1) b = pick(users).id;
    return { userAId: a, userBId: b };
  });
  let saved: any[] = [];
  const assignmentsRepo = {
    delete: jest.fn().mockResolvedValue(undefined),
    create: (a: any) => a,
    save: jest.fn((a: any[]) => ((saved = a), Promise.resolve(a))),
    find: jest.fn(() => Promise.resolve(saved)),
  };
  const service = new TeamBalancingService(
    assignmentsRepo as any,
    { findOne: jest.fn().mockResolvedValue({ id: 's1', date: '2026-10-27', teamsAutoGenerationDisabled: flagged }), update: sessionUpdate } as any,
    { find: jest.fn().mockResolvedValue(attendances) } as any,
    {} as any,
    { find: jest.fn().mockResolvedValue(rules) } as any,
    { getPlayerStats: jest.fn().mockResolvedValue(users.map((u) => ({ userId: u.id, trainingLevel: Math.round(rnd() * 100) }))) } as any,
    { sendToUsers: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, rules, users, attendances, sessionUpdate, getSaved: () => saved };
}

describe('TeamBalancingService.generateTeams — invariants over random sessions', () => {
  it('keeps every player once, headcounts within one, indexes valid (400 random sessions)', async () => {
    const problems: string[] = [];
    let ruleViolations = 0;
    let ruleTotal = 0;
    for (let iter = 0; iter < 400; iter++) {
      const nPlayers = Math.floor(rnd() * 25);
      const guestsPer = Array.from({ length: nPlayers }, () => (rnd() < 0.15 ? 1 + Math.floor(rnd() * 2) : 0));
      const nGuests = guestsPer.reduce((s, g) => s + g, 0);
      const teamCount = rnd() < 0.8 ? 2 : 2 + Math.floor(rnd() * 4);
      const { service, rules, getSaved } = run(nPlayers, guestsPer, Math.floor(rnd() * 4), teamCount);
      if (nPlayers + nGuests === 0) {
        await expect(service.generateTeams('s1', teamCount)).rejects.toThrow();
        continue;
      }
      try {
        await service.generateTeams('s1', teamCount);
      } catch (e) {
        problems.push(`iter ${iter}: threw ${(e as Error).message}`);
        continue;
      }
      const saved = getSaved();
      const label = `iter ${iter} (players ${nPlayers}, guests ${nGuests}, teams ${teamCount})`;
      if (saved.length !== nPlayers + nGuests) problems.push(`${label}: ${saved.length} assignments`);
      const ids = saved.filter((a) => a.userId).map((a) => a.userId);
      if (new Set(ids).size !== ids.length) problems.push(`${label}: duplicate player`);
      const eff = Math.min(teamCount, Math.max(2, nPlayers + nGuests));
      const counts = new Array(eff).fill(0);
      for (const a of saved) {
        if (a.teamIndex < 0 || a.teamIndex >= eff) problems.push(`${label}: teamIndex ${a.teamIndex} out of range`);
        counts[a.teamIndex]++;
      }
      if (Math.max(...counts) - Math.min(...counts) > 1) problems.push(`${label}: unbalanced ${counts.join('/')}`);
      const team = new Map(saved.filter((a) => a.userId).map((a) => [a.userId, a.teamIndex]));
      for (const r of rules) {
        if (team.has(r.userAId) && team.has(r.userBId)) {
          ruleTotal++;
          if (team.get(r.userAId) === team.get(r.userBId)) ruleViolations++;
        }
      }
    }
    expect(problems).toEqual([]);
    // Separation rules are applied best-effort (a triangle of rules can't always be satisfied),
    // but they must hold in the overwhelming majority of cases.
    expect(ruleViolations / Math.max(ruleTotal, 1)).toBeLessThan(0.05);
  });

  it('generating again re-enables automatic generation after the coach had wiped the teams', async () => {
    const { service, sessionUpdate } = run(4, [0, 0, 0, 0], 0, 2, true);
    await service.generateTeams('s1', 2);
    expect(sessionUpdate).toHaveBeenCalledWith('s1', { teamsAutoGenerationDisabled: false });
  });
});
