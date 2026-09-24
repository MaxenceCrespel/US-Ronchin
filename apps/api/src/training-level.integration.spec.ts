import { bearer, createTestApp, TestApp } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';
import { Training, TrainingType } from './trainings/entities/training.entity';
import { TrainingSession } from './trainings/entities/training-session.entity';
import { TrainingTeamAssignment } from './team-balancing/entities/training-team-assignment.entity';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** The level training teams are split on: the average points per scored training session,
 * on 0-100 (StatsService trainingLevel) — a training record only, no match needed. */
describe('training level (real stack)', () => {
  let t: TestApp;
  let coachToken: string;
  const levels = new Map<string, number>();
  const matchLevels = new Map<string, number | null>();
  let newcomerId: string;
  let streakId: string;
  let regularId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const coach = await t.createUser({ role: UserRole.COACH });
    coachToken = coach.token;
    const streak = await t.createUser();
    const regular = await t.createUser();
    const newcomer = await t.createUser();
    streakId = streak.user.id;
    regularId = regular.user.id;
    newcomerId = newcomer.user.id;

    const training = await t.repo(Training).save(
      t.repo(Training).create({
        title: 'Mardi',
        type: TrainingType.RECURRING,
        location: 'Stade',
        dayOfWeek: 2,
        startTime: '19:00',
        endTime: '20:30',
        startDate: day(-100),
        createdBy: coach.user.id,
      }),
    );
    const sessions = t.repo(TrainingSession);
    const assigns = t.repo(TrainingTeamAssignment);

    // Ten sessions. The streak player comes to the first four only, always on the team that
    // wins 5-0 (8 points each). The regular comes to all ten: he loses the first four 5-0, wins
    // the next three 2-0 (5 points each) and loses the last three 2-0 — three wins in all.
    for (let s = 0; s < 10; s++) {
      const bigWin = s < 4;
      const session = await sessions.save(
        sessions.create({
          trainingId: training.id,
          date: day(-7 * (10 - s)),
          startTime: '19:00',
          endTime: '20:30',
          location: 'Stade',
          scoreTeam0: bigWin ? 5 : 0,
          scoreTeam1: bigWin ? 0 : 2,
        }),
      );
      if (bigWin) await assigns.save(assigns.create({ trainingSessionId: session.id, userId: streakId, teamIndex: 0 }));
      // team 1 wins sessions 4-9 (0-2): the regular is on it for 4-6, on the losing team 0 for
      // the last three — and on team 1 for the first four, which team 0 wins 5-0
      const regularTeam = s < 4 ? 1 : s < 7 ? 1 : 0;
      await assigns.save(assigns.create({ trainingSessionId: session.id, userId: regularId, teamIndex: regularTeam }));
    }

    const res = await t.http().get('/api/stats/players').set(bearer(coachToken));
    for (const p of res.body as { userId: string; trainingLevel: number; skillScore: number | null }[]) {
      levels.set(p.userId, p.trainingLevel);
      matchLevels.set(p.userId, p.skillScore);
    }
  }, 120_000);
  afterAll(() => t.close());

  it('ranks four 5-0 wins above three wins in ten sessions, whatever the attendance', () => {
    expect(levels.get(streakId)!).toBeGreaterThan(levels.get(regularId)!);
  });

  it('puts a player with no scored session exactly on the club average, neither ahead nor behind', () => {
    // The club average is the mean over every scored appearance: (4 × 8 + 3 × 5 + 7 × 0)
    // points over 4 + 10 appearances
    const clubMeanPoints = (4 * 8 + 3 * 5) / 14;
    expect(levels.get(newcomerId)).toBeCloseTo(Math.round((clubMeanPoints / 8) * 1000) / 10, 1);
  });

  it('is on a 0-100 scale for everyone, never null', () => {
    for (const level of levels.values()) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(100);
    }
  });

  it('keeps trainings out of the match level: no match rated, no match level', () => {
    for (const id of [streakId, regularId, newcomerId]) expect(matchLevels.get(id)).toBeNull();
  });
});
