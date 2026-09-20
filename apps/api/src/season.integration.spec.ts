import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { seedSeason } from './test-utils/season-seed';

describe('season data (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let admin: TestUser;
  let p: TestUser[];

  beforeAll(async () => {
    t = await createTestApp();
    ({ coach, admin, players: p } = await seedSeason(t));
  }, 120_000);
  afterAll(() => t.close());

  const get = (u: TestUser, url: string) => t.http().get(url).set(bearer(u.token));

  it('exposes player and team statistics', async () => {
    const players = await get(coach, '/api/stats/players');
    expect(players.status).toBe(200);
    const striker = players.body.find((r: { userId?: string; id?: string }) => (r.userId ?? r.id) === p[8].user.id);
    expect(striker).toBeDefined();
    expect(striker.goals).toBeGreaterThanOrEqual(7);
    const team = await get(coach, '/api/stats/team');
    expect(team.status).toBe(200);
    const seasons = await get(coach, '/api/stats/seasons');
    expect(seasons.status).toBe(200);
    for (const url of [
      '/api/stats/monthly-challenges',
      '/api/stats/my-attendance-trophies',
      '/api/stats/my-training-champion-trophies',
      '/api/stats/last-attendance-trophy-winner',
      '/api/stats/last-training-champion-winner',
    ]) {
      expect((await get(p[0], url)).status).toBe(200);
    }
  });

  it('a striker who scored earns goal badges; the badge grid is complete', async () => {
    const mine = await get(p[8], '/api/badges/me');
    expect(mine.status).toBe(200);
    const earned = mine.body.filter((b: { earned: boolean }) => b.earned).map((b: { key: string }) => b.key);
    expect(earned).toContain('hat_trick');
    expect(mine.body.length).toBeGreaterThan(30);
    const keeper = await get(p[0], '/api/badges/me');
    expect(keeper.status).toBe(200);
    // the sub and a non-scorer are evaluated too
    for (const idx of [1, 2, 3, 5, 11]) expect((await get(p[idx], '/api/badges/me')).status).toBe(200);
  });

  it('levels and holders', async () => {
    expect((await get(p[8], '/api/badges/level')).status).toBe(200);
    const levels = await get(p[8], '/api/badges/levels');
    expect(levels.status).toBe(200);
    const holders = await get(admin, '/api/badges/holders');
    expect(holders.status).toBe(200);
  });

  it('badge admin tools are SUPERADMIN only', async () => {
    expect((await get(coach, `/api/badges/users/${p[8].user.id}`)).status).toBe(403);
    expect((await get(admin, `/api/badges/users/${p[8].user.id}`)).status).toBe(200);
    expect((await get(admin, `/api/badges/users/${p[8].user.id}/level`)).status).toBe(200);
    const grant = await t.http().post('/api/badges/holders/hat_trick/grant').set(bearer(admin.token)).send({ userId: p[0].user.id });
    expect(grant.status).toBeLessThan(300);
    expect((await t.http().post('/api/badges/holders/hat_trick/grant').set(bearer(coach.token)).send({ userId: p[0].user.id })).status).toBe(403);
    const revoke = await t.http().delete(`/api/badges/holders/hat_trick/${p[0].user.id}`).set(bearer(admin.token));
    expect(revoke.status).toBeLessThan(300);
    const revokeAll = await t.http().delete('/api/badges/holders/hat_trick').set(bearer(admin.token));
    expect(revokeAll.status).toBeLessThan(300);
  });

  it('training ranking and a player training history', async () => {
    const ranking = await get(p[0], '/api/training-ranking');
    expect(ranking.status).toBe(200);
    expect(ranking.body.length).toBeGreaterThan(0);
    expect((await get(admin, `/api/training-ranking/users/${p[0].user.id}`)).status).toBe(200);
    expect((await get(p[0], `/api/training-ranking/users/${p[1].user.id}`)).status).toBe(403);
  });

  it('the stats reflect real attendance, not the declared one', async () => {
    const players = await get(coach, '/api/stats/players');
    const liar = players.body.find((r: { userId?: string; id?: string }) => (r.userId ?? r.id) === p[1].user.id);
    const keeper = players.body.find((r: { userId?: string; id?: string }) => (r.userId ?? r.id) === p[0].user.id);
    expect(keeper.trainingsPresent).toBeGreaterThan(liar.trainingsPresent);
  });
});
