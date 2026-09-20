import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';
import { PlayerSubPosition } from './users/entities/user.entity';

function tomorrow(offset = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('training flow (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let players: TestUser[];
  let sessionId: string;
  let trainingId: string;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH, firstName: 'Coach', lastName: 'Boss' });
    players = [];
    for (let i = 0; i < 8; i++) {
      players.push(
        await t.createUser({
          positions: [
            i === 0
              ? PlayerSubPosition.GOALKEEPER
              : i < 4
                ? PlayerSubPosition.CENTER_BACK
                : PlayerSubPosition.STRIKER,
          ],
        }),
      );
    }
  });
  afterAll(() => t.close());

  it('only coaches can create a training', async () => {
    const body = {
      title: 'Mardi',
      type: 'RECURRING',
      location: 'Stade',
      dayOfWeek: new Date(tomorrow()).getUTCDay(),
      startTime: '19:00',
      endTime: '20:30',
      startDate: tomorrow(),
    };
    expect((await t.http().post('/api/trainings').set(bearer(players[0].token)).send(body)).status).toBe(403);
    const ok = await t.http().post('/api/trainings').set(bearer(coach.token)).send(body);
    expect(ok.status).toBe(201);
    trainingId = ok.body.id;
  });

  it('rejects an invalid payload', async () => {
    const res = await t
      .http()
      .post('/api/trainings')
      .set(bearer(coach.token))
      .send({ title: 'x', type: 'RECURRING', location: 'y', startTime: '7pm', endTime: '20:30', startDate: tomorrow() });
    expect(res.status).toBe(400);
  });

  it('generated the upcoming sessions', async () => {
    const res = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(4);
    sessionId = res.body[0].id;
    expect(res.body[0].trainingType).toBe('RECURRING');
    // generating again adds nothing
    const again = await t.http().post(`/api/trainings/${trainingId}/generate-sessions`).set(bearer(coach.token));
    expect(again.status).toBe(201);
    const after = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    expect(after.body.length).toBe(res.body.length);
  });

  it('lists trainings and updates one (propagates to future sessions)', async () => {
    const list = await t.http().get('/api/trainings').set(bearer(coach.token));
    expect(list.body).toHaveLength(1);
    const upd = await t
      .http()
      .patch(`/api/trainings/${trainingId}`)
      .set(bearer(coach.token))
      .send({ location: 'Terrain B', maxPresentPlayers: 20 });
    expect(upd.status).toBe(200);
    const sessions = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    expect(sessions.body[0].location).toBe('Terrain B');
    expect(sessions.body[0].maxPresentPlayers).toBe(20);
  });

  it('players answer, coach sees them', async () => {
    for (const p of players) {
      const res = await t
        .http()
        .put(`/api/training-sessions/${sessionId}/attendance`)
        .set(bearer(p.token))
        .send({ status: 'PRESENT' });
      expect(res.status).toBe(200);
    }
    const list = await t.http().get(`/api/training-sessions/${sessionId}/attendance`).set(bearer(coach.token));
    expect(list.body).toHaveLength(8);
    expect(list.body.every((a: { status: string }) => a.status === 'PRESENT')).toBe(true);
  });

  it('a guest can be declared and shows up', async () => {
    const res = await t
      .http()
      .put(`/api/training-sessions/${sessionId}/attendance`)
      .set(bearer(players[0].token))
      .send({ status: 'PRESENT', guests: [{ firstName: 'Ami', lastName: 'Invité' }] });
    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
  });

  it('generates two balanced teams', async () => {
    const res = await t.http().post(`/api/training-sessions/${sessionId}/teams/generate`).set(bearer(coach.token)).send({});
    expect(res.status).toBe(201);
    const perTeam = [0, 0];
    for (const a of res.body) perTeam[a.teamIndex]++;
    expect(perTeam[0] + perTeam[1]).toBe(9); // 8 players + 1 guest
    expect(Math.abs(perTeam[0] - perTeam[1])).toBeLessThanOrEqual(1);
    // both teams get a keeper-capable or defender profile spread
    const get = await t.http().get(`/api/training-sessions/${sessionId}/teams`).set(bearer(players[1].token));
    expect(get.body).toHaveLength(9);
  });

  it('a late PRESENT is placed on a team automatically', async () => {
    const late = await t.createUser();
    await t.http().put(`/api/training-sessions/${sessionId}/attendance`).set(bearer(late.token)).send({ status: 'PRESENT' });
    const teams = await t.http().get(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token));
    expect(teams.body.some((a: { userId: string }) => a.userId === late.user.id)).toBe(true);
  });

  it('coach: move, remove, add-player, walk-in, delete all', async () => {
    const teams = await t.http().get(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token));
    const first = teams.body[0];
    const other = first.teamIndex === 0 ? 1 : 0;
    const moved = await t
      .http()
      .patch(`/api/training-sessions/${sessionId}/teams`)
      .set(bearer(coach.token))
      .send({ assignmentId: first.id, teamIndex: other });
    expect(moved.status).toBe(200);

    const removed = await t
      .http()
      .delete(`/api/training-sessions/${sessionId}/teams/${first.id}`)
      .set(bearer(coach.token));
    expect(removed.status).toBe(200);
    expect(removed.body.some((a: { id: string }) => a.id === first.id)).toBe(false);

    const extra = await t.createUser();
    const added = await t
      .http()
      .post(`/api/training-sessions/${sessionId}/teams/add-player`)
      .set(bearer(coach.token))
      .send({ userId: extra.user.id });
    expect(added.status).toBe(201);
    const dup = await t
      .http()
      .post(`/api/training-sessions/${sessionId}/teams/add-player`)
      .set(bearer(coach.token))
      .send({ userId: extra.user.id });
    expect(dup.status).toBe(400);

    const walk = await t
      .http()
      .post(`/api/training-sessions/${sessionId}/teams/walk-in`)
      .set(bearer(coach.token))
      .send({ firstName: 'Passant', lastName: 'Surprise' });
    expect(walk.status).toBe(201);
    expect(walk.body.some((a: { guestLabel: string | null }) => a.guestLabel?.includes('Passant'))).toBe(true);

    expect((await t.http().delete(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token))).status).toBe(200);
    const empty = await t.http().get(`/api/training-sessions/${sessionId}/teams`).set(bearer(coach.token));
    expect(empty.body).toHaveLength(0);
  });

  it('coach can force a status and read the history', async () => {
    const forced = await t
      .http()
      .put(`/api/training-sessions/${sessionId}/attendance/${players[2].user.id}`)
      .set(bearer(coach.token))
      .send({ status: 'ABSENT' });
    expect(forced.status).toBe(200);
    const history = await t
      .http()
      .get(`/api/training-sessions/${sessionId}/attendance/history`)
      .set(bearer(coach.token));
    expect(history.status).toBe(200);
    expect(history.body.length).toBeGreaterThan(8);
    expect((await t.http().get(`/api/training-sessions/${sessionId}/attendance/history`).set(bearer(players[0].token))).status).toBe(403);
  });

  it('coach records the real pointage', async () => {
    const res = await t
      .http()
      .put(`/api/training-sessions/${sessionId}/attendance/${players[3].user.id}/actual`)
      .set(bearer(coach.token))
      .send({ status: 'PRESENT' });
    expect(res.status).toBe(200);
    expect(res.body.actualStatus).toBe('PRESENT');
  });

  it('ad-hoc sessions can be created, edited and deleted', async () => {
    const created = await t
      .http()
      .post('/api/training-sessions')
      .set(bearer(coach.token))
      .send({ date: tomorrow(30), startTime: '18:00', endTime: '19:00', location: 'Salle' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const patched = await t
      .http()
      .patch(`/api/training-sessions/${id}`)
      .set(bearer(coach.token))
      .send({ location: 'Gymnase', maxPresentPlayersOverride: 10 });
    expect(patched.status).toBe(200);
    expect((await t.http().delete(`/api/training-sessions/${id}`).set(bearer(coach.token))).status).toBe(200);
    expect((await t.http().delete(`/api/training-sessions/${id}`).set(bearer(coach.token))).status).toBe(404);
  });

  it('deleting a training removes it', async () => {
    expect((await t.http().delete(`/api/trainings/${trainingId}`).set(bearer(coach.token))).status).toBe(200);
    expect((await t.http().get('/api/trainings').set(bearer(coach.token))).body).toHaveLength(0);
  });
});
