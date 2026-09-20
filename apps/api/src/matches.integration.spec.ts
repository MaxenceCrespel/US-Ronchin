import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { PlayerSubPosition, UserRole } from './users/entities/user.entity';
import { MatchMotmVote } from './matches/entities/match-motm-vote.entity';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe('match flow (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let players: TestUser[];
  let matchId: string;
  let composition: { id: string; userId: string | null }[];

  const auth = (u: TestUser) => bearer(u.token);
  // motm / defense-boss votes target a composition row (so a not-yet-linked guest is valid too)
  const compId = (u: TestUser) => composition.find((c) => c.userId === u.user.id)!.id;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    players = [];
    for (let i = 0; i < 13; i++) {
      players.push(
        await t.createUser({
          positions: [
            i === 0
              ? PlayerSubPosition.GOALKEEPER
              : i < 5
                ? PlayerSubPosition.CENTER_BACK
                : i < 10
                  ? PlayerSubPosition.CENTER_MIDFIELDER
                  : PlayerSubPosition.STRIKER,
          ],
        }),
      );
    }
  });
  afterAll(() => t.close());

  it('only coaches create matches; payload is validated', async () => {
    const body = { date: day(1), kickOffTime: '15:00', opponent: 'FC Test', homeAway: 'HOME', source: 'FRIENDLY' };
    expect((await t.http().post('/api/matches').set(auth(players[0])).send(body)).status).toBe(403);
    expect((await t.http().post('/api/matches').set(auth(coach)).send({ ...body, kickOffTime: '3pm' })).status).toBe(400);
    const ok = await t.http().post('/api/matches').set(auth(coach)).send(body);
    expect(ok.status).toBe(201);
    matchId = ok.body.id;
    const list = await t.http().get('/api/matches').set(auth(players[0]));
    expect(list.body.map((m: { id: string }) => m.id)).toContain(matchId);
    expect((await t.http().get(`/api/matches/${matchId}`).set(auth(players[0]))).body.opponent).toBe('FC Test');
  });

  it('players declare their presence (friendly: +1 allowed)', async () => {
    for (const p of players) {
      const res = await t.http().put(`/api/matches/${matchId}/attendance`).set(auth(p)).send({ status: 'PRESENT' });
      expect(res.status).toBe(200);
    }
    const withGuest = await t
      .http()
      .put(`/api/matches/${matchId}/attendance`)
      .set(auth(players[0]))
      .send({ status: 'PRESENT', guests: [{ firstName: 'Ami' }] });
    expect(withGuest.status).toBe(200);
    const list = await t.http().get(`/api/matches/${matchId}/attendance`).set(auth(coach));
    expect(list.body).toHaveLength(13);
    // a player changes his mind
    await t.http().put(`/api/matches/${matchId}/attendance`).set(auth(players[12])).send({ status: 'ABSENT' });
    await t.http().put(`/api/matches/${matchId}/attendance`).set(auth(players[12])).send({ status: 'PRESENT' });
  });

  it('coach announces the convocation, then updates it', async () => {
    const calledIds = players.slice(0, 12).map((p) => p.user.id);
    expect((await t.http().put(`/api/matches/${matchId}/convocation`).set(auth(players[0])).send({ calledUserIds: calledIds })).status).toBe(403);
    const res = await t.http().put(`/api/matches/${matchId}/convocation`).set(auth(coach)).send({ calledUserIds: calledIds });
    expect(res.status).toBe(200);
    expect(res.body.filter((a: { called: boolean }) => a.called)).toHaveLength(12);
    expect((await t.http().get(`/api/matches/${matchId}`).set(auth(players[0]))).body.convocationAnnouncedAt).not.toBeNull();

    // a non-present id is refused
    const stranger = await t.createUser();
    const bad = await t.http().put(`/api/matches/${matchId}/convocation`).set(auth(coach)).send({ calledUserIds: [stranger.user.id] });
    expect(bad.status).toBe(400);
  });

  it('coach validates the starting XI', async () => {
    const noLineup = await t.http().get(`/api/matches/${matchId}/lineup`).set(auth(coach));
    expect(noLineup.body.slots).toBeNull();
    const slots = players.slice(0, 11).map((p) => p.user.id);
    const saved = await t
      .http()
      .put(`/api/matches/${matchId}/lineup`)
      .set(auth(coach))
      .send({ formation: '4-4-2 à plat', slots, validate: true });
    expect(saved.status).toBe(200);
    expect(saved.body.validatedAt).not.toBeNull();
    const read = await t.http().get(`/api/matches/${matchId}/lineup`).set(auth(coach));
    expect(read.body.slots).toEqual(slots);
    // not called → refused
    const bad = await t
      .http()
      .put(`/api/matches/${matchId}/lineup`)
      .set(auth(coach))
      .send({ formation: '4-3-3', slots: [players[12].user.id] });
    expect(bad.status).toBe(400);
    // lineup stays private to coaches
    expect((await t.http().get(`/api/matches/${matchId}/lineup`).set(auth(players[0]))).status).toBe(403);
    expect((await t.http().get(`/api/matches/${matchId}`).set(auth(coach))).body.lineupSlots).toBeUndefined();
  });

  it('kickoff passes, the coach records the composition', async () => {
    const moved = await t.http().patch(`/api/matches/${matchId}`).set(auth(coach)).send({ date: day(-1) });
    expect(moved.status).toBe(200);
    // presence is now locked for players
    const late = await t.http().put(`/api/matches/${matchId}/attendance`).set(auth(players[1])).send({ status: 'ABSENT' });
    expect(late.status).toBe(400);

    const entries = [
      ...players.slice(0, 11).map((p, i) => ({
        userId: p.user.id,
        isStarter: true,
        position: i === 0 ? 'GOALKEEPER' : i < 5 ? 'DEFENDER' : i < 9 ? 'MIDFIELDER' : 'FORWARD',
        formationX: 10 + i * 7,
        formationY: i === 0 ? 92 : i < 5 ? 70 : i < 9 ? 45 : 18,
      })),
      { userId: players[11].user.id, isStarter: false },
      { userId: players[12].user.id, isStarter: false, isSpectator: true },
      { guestFirstName: 'Invité', guestLastName: 'Sub', isStarter: false },
    ];
    const res = await t.http().post(`/api/matches/${matchId}/composition`).set(auth(coach)).send({ entries });
    expect(res.status).toBe(201);
    const list = await t.http().get(`/api/matches/${matchId}/composition`).set(auth(players[0]));
    composition = list.body;
    expect(composition).toHaveLength(14);
  });

  it('score, events (goals, cards) and their edition', async () => {
    const score = await t.http().patch(`/api/matches/${matchId}`).set(auth(coach)).send({ scoreHome: 3, scoreAway: 2, status: 'PLAYED' });
    expect(score.status).toBe(200);
    const scorer = players[10].user.id;
    for (const ev of [
      { type: 'GOAL', userId: scorer, assistUserId: players[9].user.id, minute: 12 },
      { type: 'GOAL', userId: scorer, minute: 40 },
      { type: 'GOAL', userId: players[8].user.id, minute: 71, goalType: 'PENALTY' },
      { type: 'YELLOW_CARD', userId: players[3].user.id, minute: 55 },
      { type: 'GOAL', scorerName: 'Passant', minute: 80 },
    ]) {
      const r = await t.http().post(`/api/matches/${matchId}/events`).set(auth(coach)).send(ev);
      expect(r.status).toBe(201);
    }
    const events = await t.http().get(`/api/matches/${matchId}/events`).set(auth(players[0]));
    expect(events.body).toHaveLength(5);
    const yellow = events.body.find((e: { type: string }) => e.type === 'YELLOW_CARD');
    const patched = await t.http().patch(`/api/matches/${matchId}/events/${yellow.id}`).set(auth(coach)).send({ minute: 60 });
    expect(patched.status).toBe(200);
    expect((await t.http().delete(`/api/matches/${matchId}/events/${yellow.id}`).set(auth(coach))).status).toBe(200);
  });

  it('votes are locked until the coach confirms the result', async () => {
    const early = await t.http().put(`/api/matches/${matchId}/motm`).set(auth(players[1])).send({ votedForId: 'b3a7c7f0-0000-4000-8000-000000000000' });
    expect(early.status).toBeGreaterThanOrEqual(400);
    const done = await t.http().patch(`/api/matches/${matchId}`).set(auth(coach)).send({ resultConfirmed: true });
    expect(done.status).toBe(200);
    expect((await t.http().get(`/api/matches/${matchId}`).set(auth(coach))).body.resultConfirmedAt).not.toBeNull();
  });

  it('players vote for MOTM and patron de la défense (blank allowed)', async () => {
    for (const [i, p] of players.slice(0, 11).entries()) {
      const target = i === 10 ? players[9] : players[10];
      const r = await t.http().put(`/api/matches/${matchId}/motm`).set(auth(p)).send({ votedForId: compId(target) });
      expect(r.status).toBe(200);
    }
    const self = await t.http().put(`/api/matches/${matchId}/motm`).set(auth(players[12])).send({ votedForId: compId(players[12]) });
    expect(self.status).toBeGreaterThanOrEqual(400);

    let motm = await t.http().get(`/api/matches/${matchId}/motm`).set(auth(players[0]));
    expect(motm.status).toBe(200);
    expect(motm.body.totalVotes).toBe(11);
    // not everyone voted yet and the first vote is fresh: results stay hidden
    expect(motm.body.revealed).toBe(false);
    expect(motm.body.results).toBeNull();
    // 24h after the first vote the result opens
    await t.repo(MatchMotmVote).update({ matchId }, { createdAt: new Date(Date.now() - 25 * 3_600_000) });
    motm = await t.http().get(`/api/matches/${matchId}/motm`).set(auth(players[0]));
    expect(motm.body.revealed).toBe(true);
    expect(motm.body.results[0].userId).toBe(players[10].user.id);

    await t.http().put(`/api/matches/${matchId}/defense-boss`).set(auth(players[5])).send({ votedForId: compId(players[2]) });
    await t.http().put(`/api/matches/${matchId}/defense-boss`).set(auth(players[6])).send({ votedForId: compId(players[2]) });
    const blank = await t.http().put(`/api/matches/${matchId}/defense-boss`).set(auth(players[7])).send({});
    expect(blank.status).toBe(200);
    const boss = await t.http().get(`/api/matches/${matchId}/defense-boss`).set(auth(players[7]));
    expect(boss.body.myVoteIsBlank).toBe(true);
  });

  it('players rate their teammates', async () => {
    const targets = composition.filter((c) => c.userId !== players[1].user.id && c.userId !== players[10].user.id && !(c as { isSpectator?: boolean }).isSpectator);
    const pending = await t.http().get(`/api/matches/${matchId}/ratings/submitted`).set(auth(players[1]));
    expect(pending.body.submitted).toBe(false);
    const single = await t.http().post(`/api/matches/${matchId}/ratings`).set(auth(players[1])).send({ ratedUserId: players[10].user.id, rating: 8 });
    expect(single.status).toBeLessThan(300);
    const submit = await t
      .http()
      .post(`/api/matches/${matchId}/ratings/submit`)
      .set(auth(players[1]))
      .send({ ratings: targets.map((c) => (c.userId ? { ratedUserId: c.userId, rating: 7 } : { ratedGuestId: c.id, rating: 7 })) });
    expect(submit.status).toBeLessThan(300);
    const mine = await t.http().get(`/api/matches/${matchId}/ratings/me`).set(auth(players[1]));
    expect(mine.body.length).toBeGreaterThan(0);
    expect((await t.http().get(`/api/matches/${matchId}/ratings/submitted`).set(auth(players[1]))).body.submitted).toBe(true);
    const all = await t.http().get(`/api/matches/${matchId}/ratings`).set(auth(coach));
    expect(all.status).toBe(200);
    expect((await t.http().get(`/api/matches/${matchId}/ratings`).set(auth(players[0]))).status).toBe(403);
    const summary = await t.http().get(`/api/matches/${matchId}/ratings/summary`).set(auth(players[0]));
    expect(summary.status).toBe(200);
  });

  it('trophies and a guest link', async () => {
    expect((await t.http().get('/api/matches/my-trophies').set(auth(players[10]))).status).toBe(200);
    expect((await t.http().get('/api/matches/recent-trophy-winners').set(auth(players[0]))).status).toBe(200);
    const guest = composition.find((c) => !c.userId)!;
    const newcomer = await t.createUser();
    const linked = await t
      .http()
      .patch(`/api/matches/${matchId}/composition/${guest.id}/link`)
      .set(auth(coach))
      .send({ userId: newcomer.user.id });
    expect(linked.status).toBe(200);
  });

  it('deleting the match removes it', async () => {
    expect((await t.http().delete(`/api/matches/${matchId}`).set(auth(players[0]))).status).toBe(403);
    expect((await t.http().delete(`/api/matches/${matchId}`).set(auth(coach))).status).toBe(200);
    expect((await t.http().get(`/api/matches/${matchId}`).set(auth(coach))).status).toBe(404);
  });
});
