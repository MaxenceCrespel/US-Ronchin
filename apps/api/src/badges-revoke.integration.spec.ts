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

describe('match-derived badges are taken back when the data changes (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let admin: TestUser;
  let player: TestUser;
  let granted: TestUser;
  const matchIds: string[] = [];
  const auth = (u: TestUser) => bearer(u.token);

  const setComposition = (matchId: string, spectator: boolean) =>
    t
      .http()
      .post(`/api/matches/${matchId}/composition`)
      .set(auth(coach))
      .send({ entries: [{ userId: player.user.id, isStarter: false, isSpectator: spectator }] });

  const earned = async (u: TestUser, key: string) => {
    const res = await t.http().get('/api/badges/me').set(auth(u));
    expect(res.status).toBe(200);
    return res.body.find((b: { key: string }) => b.key === key).earned;
  };

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    admin = await t.createUser({ role: UserRole.SUPERADMIN });
    player = await t.createUser({});
    granted = await t.createUser({});
    for (const [i, date] of pastSaturdays(5).entries()) {
      const created = await t
        .http()
        .post('/api/matches')
        .set(auth(coach))
        .send({ date: futureDay(30 + i), kickOffTime: '15:00', opponent: `Rival ${i}`, homeAway: 'AWAY', source: 'FRIENDLY' });
      expect(created.status).toBe(201);
      const id = created.body.id;
      matchIds.push(id);
      await t.http().patch(`/api/matches/${id}`).set(auth(coach)).send({ date });
      expect((await setComposition(id, false)).status).toBe(201);
      await t.http().patch(`/api/matches/${id}`).set(auth(coach)).send({ scoreHome: 1, scoreAway: 2, status: 'PLAYED' });
    }
  });
  afterAll(() => t.close());

  it('earns "Le Routard" after five away matches', async () => {
    expect(await earned(player, 'routard')).toBe(true);
  });

  it('loses it once one of those matches is corrected to a spectator entry', async () => {
    expect((await setComposition(matchIds[0], true)).status).toBe(201);
    expect(await earned(player, 'routard')).toBe(false);
  });

  it('never takes back a badge an admin granted by hand', async () => {
    const grant = await t
      .http()
      .post('/api/badges/holders/routard/grant')
      .set(auth(admin))
      .send({ userId: granted.user.id });
    expect(grant.status).toBe(201);
    expect(await earned(granted, 'routard')).toBe(true);
    expect(await earned(granted, 'routard')).toBe(true);
  });
});
