import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TeamBalancingService } from './team-balancing.service';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { PlayerSubPosition } from '../users/entities/user.entity';
import { StatsService } from '../stats/stats.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

const POSITIONS = [
  PlayerSubPosition.GOALKEEPER,
  PlayerSubPosition.CENTER_BACK,
  PlayerSubPosition.CENTER_MIDFIELDER,
  PlayerSubPosition.STRIKER,
];

// Small deterministic PRNG so a failing configuration can be replayed from its seed.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function generate(opts: {
  players: { id: string; score: number; positions: PlayerSubPosition[] }[];
  guests: { owner: string; position: PlayerSubPosition | null }[];
  rules?: { userAId: string; userBId: string }[];
}) {
  const saved: { teamIndex: number; userId: string | null }[] = [];
  const attendances = opts.players.map((p) => ({
    userId: p.id,
    status: AttendanceStatus.PRESENT,
    actualStatus: null,
    confirmed: true,
    confirmedGuestCount: opts.guests.filter((g) => g.owner === p.id).length,
    user: { id: p.id, firstName: p.id, lastName: 'X', positions: p.positions },
    guests: opts.guests
      .filter((g) => g.owner === p.id)
      .map((g, i) => ({ id: `${p.id}-g${i}`, firstName: `G${i}`, lastName: null, position: g.position })),
  }));
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamBalancingService,
      {
        provide: getRepositoryToken(TrainingTeamAssignment),
        useValue: {
          delete: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((a: { teamIndex: number; userId: string | null }) => a),
          save: jest.fn((entities: { teamIndex: number; userId: string | null }[]) => {
            saved.push(...entities);
            return Promise.resolve(entities);
          }),
          find: jest.fn(() => Promise.resolve(saved)),
        },
      },
      {
        provide: getRepositoryToken(TrainingSession),
        useValue: { findOne: jest.fn().mockResolvedValue({ id: 's1', date: '2026-09-25' }) },
      },
      { provide: getRepositoryToken(Attendance), useValue: { find: jest.fn().mockResolvedValue(attendances) } },
      { provide: getRepositoryToken(AttendanceGuest), useValue: {} },
      { provide: getRepositoryToken(PlayerSeparationRule), useValue: { find: jest.fn().mockResolvedValue(opts.rules ?? []) } },
      {
        provide: StatsService,
        useValue: { getPlayerStats: jest.fn().mockResolvedValue(opts.players.map((p) => ({ userId: p.id, skillScore: p.score }))) },
      },
      { provide: PushNotificationsService, useValue: { sendToUsers: jest.fn().mockResolvedValue(undefined) } },
    ],
  }).compile();
  await moduleRef.get(TeamBalancingService).generateTeams('s1');
  const sizes = [0, 0];
  const teamOf = new Map<string, number>();
  for (const a of saved) {
    sizes[a.teamIndex]++;
    if (a.userId) teamOf.set(a.userId, a.teamIndex);
  }
  return Object.assign(sizes, { teamOf });
}

describe('TeamBalancingService.generateTeams — team sizes', () => {
  it.each([
    ['with positioned guests', true],
    ['with guests without a position', false],
  ])('keeps two teams within one person of each other, %s', async (_label, withPositions) => {
    let worst = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const next = rng(seed);
      const pick = () => POSITIONS[Math.floor(next() * POSITIONS.length)];
      const players = Array.from({ length: 13 }, (_, i) => ({
        id: `p${i}`,
        score: 90 - i * 3,
        positions: [pick()],
      }));
      const guests = Array.from({ length: 3 }, (_, i) => ({
        owner: `p${i * 4}`,
        position: withPositions && next() < 0.8 ? pick() : null,
      }));
      const sizes = await generate({ players, guests });
      expect(sizes[0] + sizes[1]).toBe(16); // everyone present lands on a team, nobody extra
      const gap = Math.abs(sizes[0] - sizes[1]);
      worst = Math.max(worst, gap);
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('keeps admin-separated players apart and the teams level, dealing line by line', async () => {
    // four forwards: f1 and f3 would land together (best and third best), but must not
    const players = [
      { id: 'f1', score: 90, positions: [PlayerSubPosition.STRIKER] },
      { id: 'f2', score: 80, positions: [PlayerSubPosition.STRIKER] },
      { id: 'f3', score: 70, positions: [PlayerSubPosition.STRIKER] },
      { id: 'f4', score: 60, positions: [PlayerSubPosition.STRIKER] },
      { id: 'm1', score: 85, positions: [PlayerSubPosition.CENTER_MIDFIELDER] },
      { id: 'm2', score: 75, positions: [PlayerSubPosition.CENTER_MIDFIELDER] },
      { id: 'd1', score: 65, positions: [PlayerSubPosition.CENTER_BACK] },
      { id: 'd2', score: 55, positions: [PlayerSubPosition.CENTER_BACK] },
    ];
    for (let run = 0; run < 20; run++) {
      const sizes = await generate({ players, guests: [], rules: [{ userAId: 'f1', userBId: 'f3' }] });
      expect(sizes.teamOf.get('f1')).not.toBe(sizes.teamOf.get('f3'));
      expect([sizes[0], sizes[1]]).toEqual([4, 4]);
    }
  });

  it('keeps every separated pair apart and the teams level over random squads', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = rng(seed);
      const pick = () => POSITIONS[Math.floor(next() * POSITIONS.length)];
      const players = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, score: 90 - i * 3, positions: [pick()] }));
      const guests = Array.from({ length: 3 }, (_, i) => ({ owner: `p${i * 4}`, position: pick() }));
      const rules = [
        { userAId: 'p0', userBId: 'p2' },
        { userAId: 'p1', userBId: 'p5' },
      ];
      const sizes = await generate({ players, guests, rules });
      expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(1);
      for (const r of rules) expect(sizes.teamOf.get(r.userAId)).not.toBe(sizes.teamOf.get(r.userBId));
    }
  });
});
