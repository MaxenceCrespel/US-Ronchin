import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

function inDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('team list order stays put when someone changes team (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let sessionId: string;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    const players: TestUser[] = [];
    for (let i = 0; i < 8; i++) players.push(await t.createUser({}));
    await t.http().post('/api/trainings').set(bearer(coach.token)).send({
      title: 'Ordre', type: 'ONE_OFF', location: 'Stade', startTime: '20:30', endTime: '22:00',
      startDate: inDays(3), maxPresentPlayers: 12,
    });
    sessionId = (await t.http().get('/api/training-sessions').set(bearer(coach.token))).body[0].id;
    for (const p of players) {
      await t.http().put(`/api/training-sessions/${sessionId}/attendance`).set(bearer(p.token)).send({ status: 'PRESENT' });
    }
    await t.http().post(`/api/training-sessions/${sessionId}/teams/generate`).set(bearer(coach.token)).send({ teamCount: 2 });
  });
  afterAll(() => t.close());

  const list = async () =>
    (await t.http().get(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token))).body as { id: string; teamIndex: number }[];
  const ids = (rows: { id: string; teamIndex: number }[], team: number) => rows.filter((r) => r.teamIndex === team).map((r) => r.id);

  it('keeps the same order on every read', async () => {
    expect(await list()).toEqual(await list());
  });

  it('puts the moved player at the bottom of the other team and leaves everyone else where they were', async () => {
    const before = await list();
    const moved = ids(before, 0)[1];
    const res = await t.http().patch(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token)).send({ assignmentId: moved, teamIndex: 1 });
    expect(res.status).toBe(200);
    const after = await list();
    expect(ids(after, 1)).toEqual([...ids(before, 1), moved]);
    expect(ids(after, 0)).toEqual(ids(before, 0).filter((id) => id !== moved));
  });
});
