import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

function inDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Players answering at the same instant — right after a "who's coming?" notification, say.
// Everything below runs against the real stack and a real Postgres.
describe('training attendance under simultaneous requests (real stack)', () => {
  const CAP = 4;
  let t: TestApp;
  let coach: TestUser;
  let players: TestUser[];
  let sessionId: string;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH, firstName: 'Coach', lastName: 'Boss' });
    players = [];
    for (let i = 0; i < 12; i++) players.push(await t.createUser({}));
    const created = await t
      .http()
      .post('/api/trainings')
      .set(bearer(coach.token))
      .send({
        title: 'Concurrence',
        type: 'ONE_OFF',
        location: 'Stade',
        startTime: '20:30',
        endTime: '22:00',
        startDate: inDays(3),
        maxPresentPlayers: CAP,
      });
    expect(created.status).toBe(201);
    const sessions = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    sessionId = sessions.body[0].id;
  });
  afterAll(() => t.close());

  const answer = (p: TestUser, body: object) =>
    t.http().put(`/api/training-sessions/${sessionId}/attendance`).set(bearer(p.token)).send(body);

  it('never confirms more players than the cap when everyone answers at once', async () => {
    const responses = await Promise.all(players.map((p) => answer(p, { status: 'PRESENT' })));
    expect(responses.map((r) => r.status)).toEqual(players.map(() => 200));

    const list = await t.http().get(`/api/training-sessions/${sessionId}/attendance`).set(bearer(coach.token));
    const confirmed = list.body.filter((a: { confirmed: boolean }) => a.confirmed);
    expect(confirmed).toHaveLength(CAP);
    expect(list.body).toHaveLength(players.length);
  });

  it('survives the same player tapping several times in a row', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => answer(players[0], { status: 'MAYBE' })));
    expect(responses.map((r) => r.status)).toEqual(responses.map(() => 200));
    const list = await t.http().get(`/api/training-sessions/${sessionId}/attendance`).set(bearer(coach.token));
    expect(list.body.filter((a: { userId: string }) => a.userId === players[0].user.id)).toHaveLength(1);
  });

  it('hands every freed place to someone on the waitlist, exactly once, when several people leave together', async () => {
    const list = await t.http().get(`/api/training-sessions/${sessionId}/attendance`).set(bearer(coach.token));
    const holders = list.body
      .filter((a: { confirmed: boolean; status: string }) => a.confirmed && a.status === 'PRESENT')
      .map((a: { userId: string }) => players.find((p) => p.user.id === a.userId)!);
    await Promise.all(holders.slice(0, 2).map((p: TestUser) => answer(p, { status: 'ABSENT' })));
    const after = await t.http().get(`/api/training-sessions/${sessionId}/attendance`).set(bearer(coach.token));
    const stillIn = after.body.filter((a: { confirmed: boolean; status: string }) => a.confirmed && a.status === 'PRESENT');
    expect(stillIn).toHaveLength(CAP);
  });
});

describe('cancelled session (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let player: TestUser;
  let sessionId: string;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH, firstName: 'Coach', lastName: 'Boss' });
    player = await t.createUser({});
    const date = inDays(5);
    const created = await t
      .http()
      .post('/api/trainings')
      .set(bearer(coach.token))
      .send({ title: 'Annulée', type: 'ONE_OFF', location: 'Stade', startTime: '20:30', endTime: '22:00', startDate: date });
    expect(created.status).toBe(201);
    const sessions = await t.http().get('/api/training-sessions').set(bearer(coach.token));
    sessionId = sessions.body[0].id;
  });
  afterAll(() => t.close());

  it('accepts answers until the coach cancels it, then refuses them', async () => {
    const answer = () =>
      t.http().put(`/api/training-sessions/${sessionId}/attendance`).set(bearer(player.token)).send({ status: 'PRESENT' });
    expect((await answer()).status).toBe(200);

    const cancel = await t
      .http()
      .patch(`/api/training-sessions/${sessionId}`)
      .set(bearer(coach.token))
      .send({ cancelled: true });
    expect(cancel.status).toBe(200);
    expect((await answer()).status).toBe(400);

    await t.http().patch(`/api/training-sessions/${sessionId}`).set(bearer(coach.token)).send({ cancelled: false });
    expect((await answer()).status).toBe(200);
  });

  it("refuses to generate teams for it", async () => {
    await t.http().patch(`/api/training-sessions/${sessionId}`).set(bearer(coach.token)).send({ cancelled: true });
    const res = await t.http().post(`/api/training-sessions/${sessionId}/teams/generate`).set(bearer(coach.token)).send({});
    expect(res.status).toBe(400);
  });
});
