import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

function inDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('team levels for the coach (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let players: TestUser[];
  let sessionId: string;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    players = [];
    for (let i = 0; i < 6; i++) players.push(await t.createUser({}));
    await t
      .http()
      .post('/api/trainings')
      .set(bearer(coach.token))
      .send({
        title: 'Niveaux',
        type: 'ONE_OFF',
        location: 'Stade',
        startTime: '20:30',
        endTime: '22:00',
        startDate: inDays(3),
        maxPresentPlayers: 12,
      });
    const sessions = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    sessionId = sessions.body[0].id;
    for (const p of players) {
      await t.http().put(`/api/training-sessions/${sessionId}/attendance`).set(bearer(p.token)).send({ status: 'PRESENT' });
    }
    const generated = await t.http().post(`/api/training-sessions/${sessionId}/teams/generate`).set(bearer(coach.token)).send({ teamCount: 2 });
    expect(generated.status).toBe(201);
  });
  afterAll(() => t.close());

  it('gives every team its headcount, total and mean level, and each player a level', async () => {
    const res = await t.http().get(`/api/training-sessions/${sessionId}/teams/levels`).set(bearer(coach.token));
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(2);
    expect(res.body.teams.map((x: { playerCount: number }) => x.playerCount)).toEqual([3, 3]);
    for (const team of res.body.teams) {
      expect(team.rated + team.unrated).toBe(team.playerCount);
      expect(team.average).toBeCloseTo(team.total / team.rated, 1);
    }
    expect(Object.keys(res.body.players).sort()).toEqual(players.map((p) => p.user.id).sort());
  });

  it('is reserved to the coach', async () => {
    const res = await t.http().get(`/api/training-sessions/${sessionId}/teams/levels`).set(bearer(players[0].token));
    expect(res.status).toBe(403);
  });
});
