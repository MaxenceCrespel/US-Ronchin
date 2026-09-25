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

/** Recent results weigh more (a training result counts half as much every 60 days): two
 * players with the very same record, three wins and three losses, aren't level — the one whose
 * wins are recent is stronger NOW, and gets split from his usual teammates sooner. */
describe('training level follows recent results (real stack)', () => {
  let t: TestApp;
  const level = new Map<string, number>();
  let recentWinnerId: string;
  let oldWinnerId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const coach = await t.createUser({ role: UserRole.COACH });
    const recentWinner = await t.createUser();
    const oldWinner = await t.createUser();
    recentWinnerId = recentWinner.user.id;
    oldWinnerId = oldWinner.user.id;
    const training = await t.repo(Training).save(
      t.repo(Training).create({
        title: 'Mardi',
        type: TrainingType.RECURRING,
        location: 'Stade',
        dayOfWeek: 2,
        startTime: '19:00',
        endTime: '20:30',
        startDate: day(-120),
        createdBy: coach.user.id,
      }),
    );
    const sessions = t.repo(TrainingSession);
    const assigns = t.repo(TrainingTeamAssignment);
    // Six sessions, team 0 always wins 5-0: three old ones (12 weeks back), three recent ones.
    for (const [i, daysAgo] of [84, 77, 70, 21, 14, 7].entries()) {
      const session = await sessions.save(
        sessions.create({
          trainingId: training.id,
          date: day(-daysAgo),
          startTime: '19:00',
          endTime: '20:30',
          location: 'Stade',
          scoreTeam0: 5,
          scoreTeam1: 0,
        }),
      );
      const oldSession = i < 3;
      await assigns.save(assigns.create({ trainingSessionId: session.id, userId: oldWinnerId, teamIndex: oldSession ? 0 : 1 }));
      await assigns.save(assigns.create({ trainingSessionId: session.id, userId: recentWinnerId, teamIndex: oldSession ? 1 : 0 }));
    }
    const res = await t.http().get('/api/stats/players').set(bearer(coach.token));
    for (const p of res.body as { userId: string; trainingLevel: number }[]) level.set(p.userId, p.trainingLevel);
  }, 120_000);
  afterAll(() => t.close());

  it('puts the player whose wins are recent above the one whose wins are old, same record', () => {
    expect(level.get(recentWinnerId)!).toBeGreaterThan(level.get(oldWinnerId)!);
  });
});
