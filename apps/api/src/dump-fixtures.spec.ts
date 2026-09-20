import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bearer, createTestApp, TestApp } from './test-utils/test-app';
import { seedSeason } from './test-utils/season-seed';

/** Not a real test: with DUMP_FIXTURES=1 it seeds a mini-season, then records what the real
 * API answers on every GET the web app makes, as JSON under apps/web/src/test/fixtures. The web
 * component tests serve those answers back, so their data has exactly the real shapes. */
const maybe = process.env.DUMP_FIXTURES ? describe : describe.skip;

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

maybe('dump API fixtures for the web tests', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  }, 120_000);
  afterAll(() => t.close());

  it('writes the fixtures', async () => {
    const { coach, admin, players, matchIds, sessionIds } = await seedSeason(t);
    const auth = (u: { token: string }) => bearer(u.token);
    const post = async (u: { token: string }, url: string, body: object) => {
      const r = await t.http().post(url).set(auth(u)).send(body);
      if (r.status >= 300) throw new Error(`${url} ${r.status} ${JSON.stringify(r.body)}`);
      return r.body;
    };

    // an upcoming match: everybody present, convocation announced, lineup validated
    const upcoming = await post(coach, '/api/matches', { date: day(2), kickOffTime: '15:00', opponent: 'FC À Venir', homeAway: 'HOME', source: 'FRIENDLY' });
    for (const p of players) await t.http().put(`/api/matches/${upcoming.id}/attendance`).set(auth(p)).send({ status: 'PRESENT' });
    const calledIds = players.slice(0, 12).map((p) => p.user.id);
    await t.http().put(`/api/matches/${upcoming.id}/convocation`).set(auth(coach)).send({ calledUserIds: calledIds });
    await t.http().put(`/api/matches/${upcoming.id}/lineup`).set(auth(coach)).send({ formation: '4-4-2 à plat', slots: calledIds.slice(0, 11), validate: true });

    // an upcoming training with answers and generated teams
    const training = await post(coach, '/api/trainings', { title: 'Jeudi', type: 'RECURRING', location: 'Stade', dayOfWeek: new Date(day(1)).getUTCDay(), startTime: '19:00', endTime: '20:30', startDate: day(1), maxPresentPlayers: 20 });
    const sessions = (await t.http().get('/api/training-sessions').set(auth(coach))).body as { id: string; date: string }[];
    const upcomingSession = sessions.find((s) => s.date >= day(1))!;
    for (const p of players) await t.http().put(`/api/training-sessions/${upcomingSession.id}/attendance`).set(auth(p)).send({ status: 'PRESENT', guests: p === players[0] ? [{ firstName: 'Ami' }] : [] });
    await t.http().post(`/api/training-sessions/${upcomingSession.id}/teams/generate`).set(auth(coach)).send({});

    const gets = (id: string) => [
      '/api/users/me', '/api/users', '/api/matches', '/api/matches/my-trophies', '/api/matches/recent-trophy-winners',
      '/api/trainings', '/api/training-sessions', '/api/stats/players', '/api/stats/team', '/api/stats/seasons',
      '/api/stats/monthly-challenges', '/api/stats/my-attendance-trophies', '/api/stats/my-training-champion-trophies',
      '/api/stats/last-attendance-trophy-winner', '/api/stats/last-training-champion-winner',
      '/api/badges/me', '/api/badges/level', '/api/badges/levels', '/api/awards/categories', '/api/awards/monthly',
      '/api/awards/trophy-count', '/api/standings', '/api/standings/logs', '/api/training-ranking', '/api/settings',
      '/api/push/vapid-public-key', '/api/fff-sync/logs', '/api/training-guest-matches',
      `/api/matches/${matchIds[0]}/ratings`,
      '/api/badges/holders', '/api/admin/kpis', '/api/player-separation-rules/all',
      ...[...matchIds, upcoming.id].flatMap((m) => [
        `/api/matches/${m}`, `/api/matches/${m}/composition`, `/api/matches/${m}/events`, `/api/matches/${m}/attendance`,
        `/api/matches/${m}/motm`, `/api/matches/${m}/defense-boss`, `/api/matches/${m}/ratings/me`,
        `/api/matches/${m}/ratings/submitted`, `/api/matches/${m}/ratings/summary`, `/api/matches/${m}/lineup`,
      ]),
      ...[...sessionIds, upcomingSession.id].flatMap((s) => [
        `/api/training-sessions/${s}/attendance`, `/api/training-sessions/${s}/teams`, `/api/training-sessions/${s}/attendance/history`,
      ]),
      `/api/badges/users/${id}`, `/api/badges/users/${id}/level`, `/api/player-separation-rules/${id}`,
    ];

    const dump: Record<string, Record<string, unknown>> = { coach: {}, player: {}, admin: {} };
    const who = { coach, player: players[8], admin };
    for (const [role, user] of Object.entries(who)) {
      // non-coach roles only need what actually differs per user
      const dependent = /users\/me|badges|stats\/my|stats\/last|motm|defense-boss|ratings\/(me|submitted)|awards|admin\/kpis|separation|matches\/my-trophies/;
      for (const url of gets(players[8].user.id).filter((u) => role === 'coach' || dependent.test(u))) {
        const res = await t.http().get(url).set(auth(user));
        if (res.status === 200) dump[role][url.replace(/^\/api/, '')] = res.body;
      }
    }
    const meta = {
      coachId: coach.user.id,
      adminId: admin.user.id,
      playerId: players[8].user.id,
      playerIds: players.map((p) => p.user.id),
      matchIds,
      upcomingMatchId: upcoming.id,
      sessionIds,
      upcomingSessionId: upcomingSession.id,
      trainingId: training.id,
    };
    const dir = join(__dirname, '../../web/src/test/fixtures');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'api.json'), JSON.stringify({ meta, roles: dump }, null, 1));
    expect(Object.keys(dump.coach).length).toBeGreaterThan(40);
  }, 240_000);
});
