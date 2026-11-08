import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

const futureDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// The most recent `count` Saturdays strictly before today, as YYYY-MM-DD.
function pastSaturdays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (out.length < count) {
    if (d.getDay() === 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

describe('a spectator earns no match badge nor stat (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let spectator: TestUser;
  let substitute: TestUser;
  const auth = (u: TestUser) => bearer(u.token);

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    spectator = await t.createUser({});
    substitute = await t.createUser({});
    for (const [i, date] of pastSaturdays(5).entries()) {
      const created = await t
        .http()
        .post('/api/matches')
        .set(auth(coach))
        .send({ date: futureDay(30 + i), kickOffTime: '15:00', opponent: `Rival ${i}`, homeAway: 'AWAY', source: 'FRIENDLY' });
      expect(created.status).toBe(201);
      const id = created.body.id;
      await t.http().patch(`/api/matches/${id}`).set(auth(coach)).send({ date });
      const comp = await t
        .http()
        .post(`/api/matches/${id}/composition`)
        .set(auth(coach))
        .send({
          entries: [
            { userId: spectator.user.id, isStarter: false, isSpectator: true },
            { userId: substitute.user.id, isStarter: false },
          ],
        });
      expect(comp.status).toBe(201);
      const played = await t
        .http()
        .patch(`/api/matches/${id}`)
        .set(auth(coach))
        .send({ scoreHome: 1, scoreAway: 2, status: 'PLAYED' });
      expect(played.status).toBe(200);
    }
  });
  afterAll(() => t.close());

  const earned = async (u: TestUser, key: string) => {
    const res = await t.http().get('/api/badges/me').set(auth(u));
    expect(res.status).toBe(200);
    return res.body.find((b: { key: string }) => b.key === key).earned;
  };

  it('five away matches as a substitute earn "Le Routard"', async () => {
    expect(await earned(substitute, 'routard')).toBe(true);
  });

  it('the same five away matches as a spectator earn nothing', async () => {
    expect(await earned(spectator, 'routard')).toBe(false);
    expect(await earned(spectator, 'footballeur_dimanche')).toBe(false);
  });

  it('a spectator has no match played in the stats, a substitute does', async () => {
    const res = await t.http().get('/api/stats/players').set(auth(coach));
    expect(res.status).toBe(200);
    const row = (u: TestUser) => res.body.find((p: { userId: string }) => p.userId === u.user.id);
    expect(row(spectator).matchesPlayed).toBe(0);
    expect(row(substitute).matchesPlayed).toBe(5);
  });
});
