import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';
import { FffScraperService } from './fff-sync/fff-scraper.service';
import { Match } from './matches/entities/match.entity';

const scraped = (over: Record<string, unknown> = {}) => ({
  fffMatchId: 'F1',
  date: '2026-10-04',
  kickOffTime: '15:00',
  opponent: 'FC Un',
  homeAway: 'HOME',
  venue: null,
  competition: 'D6 Poule A',
  scoreHome: null,
  scoreAway: null,
  played: false,
  matchDetailUrl: 'https://epreuves.fff.fr/match/1',
  surface: null,
  ...over,
});

describe('FFF sync & standings (real stack, scraper faked)', () => {
  let t: TestApp;
  let coach: TestUser;
  let player: TestUser;
  const scraper = {
    scrapeMatches: jest.fn(),
    scrapeVenue: jest.fn(),
    scrapeStandings: jest.fn(),
  };
  const KEY = { 'x-sync-api-key': 'test-sync-api-key' };
  const TEAM_URL = 'https://epreuves.fff.fr/competition/club/12345-us-ronchin/equipe/abc';

  beforeAll(async () => {
    t = await createTestApp([{ provide: FffScraperService, useValue: scraper }]);
    coach = await t.createUser({ role: UserRole.COACH });
    player = await t.createUser();
  });
  afterAll(() => t.close());

  it('refuses to sync until the team URL is configured', async () => {
    const res = await t.http().post('/api/fff-sync/run').set(bearer(coach.token));
    expect(res.status).toBe(400);
    expect((await t.http().post('/api/fff-sync/run').set(bearer(player.token))).status).toBe(403);
    await t.http().patch('/api/settings').set(bearer(coach.token)).send({ fffTeamUrl: TEAM_URL });
  });

  it('scrapes, resolves the venue lazily, creates then updates matches', async () => {
    scraper.scrapeMatches.mockResolvedValue([
      scraped(),
      scraped({ fffMatchId: 'F2', opponent: 'FC Deux', homeAway: 'AWAY', date: '2026-09-20', played: true, scoreHome: 1, scoreAway: 4, venue: 'Stade Deux', surface: 'Synthétique', matchDetailUrl: null }),
    ]);
    scraper.scrapeVenue.mockResolvedValue({ venue: 'Stade Un', surface: 'Pelouse Naturelle' });
    const run = await t.http().post('/api/fff-sync/run').set(bearer(coach.token));
    expect(run.status).toBe(201);
    expect(run.body).toMatchObject({ status: 'SUCCESS', matchesFound: 2, matchesCreated: 2, matchesUpdated: 0 });
    expect(scraper.scrapeVenue).toHaveBeenCalledTimes(1);

    const matches = await t.repo(Match).find({ order: { date: 'ASC' } });
    expect(matches.map((m) => m.opponent)).toEqual(['FC Deux', 'FC Un']);
    expect(matches[0]).toMatchObject({ status: 'PLAYED', scoreHome: 1, scoreAway: 4, venue: 'Stade Deux' });
    expect(matches[1]).toMatchObject({ status: 'SCHEDULED', venue: 'Stade Un', surface: 'Pelouse Naturelle' });

    // resync: a changed kickoff updates in place, the known venue is not re-fetched
    scraper.scrapeVenue.mockClear();
    scraper.scrapeMatches.mockResolvedValue([scraped({ kickOffTime: '16:30' })]);
    const again = await t.http().post('/api/fff-sync/run').set(bearer(coach.token));
    expect(again.body).toMatchObject({ matchesCreated: 0, matchesUpdated: 1 });
    expect(scraper.scrapeVenue).not.toHaveBeenCalled();
    expect((await t.repo(Match).findOneByOrFail({ fffMatchId: 'F1' })).kickOffTime).toMatch(/^16:30/);
  });

  it('logs a scraper failure instead of throwing', async () => {
    scraper.scrapeMatches.mockRejectedValue(new Error('WAF blocked'));
    const res = await t.http().post('/api/fff-sync/run').set(bearer(coach.token));
    expect(res.body).toMatchObject({ status: 'ERROR', errorMessage: 'WAF blocked' });
    const logs = await t.http().get('/api/fff-sync/logs').set(bearer(coach.token));
    expect(logs.body.length).toBeGreaterThanOrEqual(3);
    expect((await t.http().get('/api/fff-sync/logs').set(bearer(player.token))).status).toBe(403);
  });

  it('the local script path is protected by the shared API key', async () => {
    expect((await t.http().get('/api/fff-sync/sync-target')).status).toBe(401);
    expect((await t.http().get('/api/fff-sync/sync-target').set({ 'x-sync-api-key': 'wrong' })).status).toBe(401);
    const target = await t.http().get('/api/fff-sync/sync-target').set(KEY);
    expect(target.body.fffTeamUrl).toBe(TEAM_URL);
    const existing = await t.http().get('/api/fff-sync/existing-matches').set(KEY);
    expect(existing.body.length).toBeGreaterThanOrEqual(2);

    const imp = await t.http().post('/api/fff-sync/import').set(KEY).send({ matches: [scraped({ fffMatchId: 'F9', opponent: 'FC Neuf', date: '2026-11-01' })] });
    expect(imp.status).toBe(201);
    expect(imp.body).toMatchObject({ status: 'SUCCESS', matchesCreated: 1 });
    expect((await t.http().post('/api/fff-sync/import').set(KEY).send({ matches: [{ opponent: 'x' }] })).status).toBe(400);
  });

  it('standings: sync, import, read and logs', async () => {
    const row = (rank: number, teamName: string) => ({ rank, teamName, points: 30 - rank, played: 10, won: 6, drawn: 2, lost: 2, goalsFor: 20, goalsAgainst: 10, goalDifference: 10 });
    scraper.scrapeStandings.mockResolvedValue([row(1, 'FC Leader'), row(2, 'US RONCHIN')]);
    const sync = await t.http().post('/api/standings/sync').set(bearer(coach.token));
    expect(sync.status).toBe(201);
    expect(sync.body).toMatchObject({ status: 'SUCCESS', teamsFound: 2 });
    const table = await t.http().get('/api/standings').set(bearer(player.token));
    expect(table.body.map((r: { teamName: string }) => r.teamName)).toEqual(['FC Leader', 'US RONCHIN']);
    expect(table.body[1].isUs).toBe(true);
    expect(table.body[0].isUs).toBe(false);

    scraper.scrapeStandings.mockRejectedValue(new Error('blocked'));
    expect((await t.http().post('/api/standings/sync').set(bearer(coach.token))).body).toMatchObject({ status: 'ERROR', errorMessage: 'blocked' });

    const imp = await t.http().post('/api/standings/import').set(KEY).send({ standings: [row(1, 'A'), row(2, 'B'), row(3, 'C')] });
    expect(imp.body).toMatchObject({ status: 'SUCCESS', teamsFound: 3 });
    expect((await t.http().get('/api/standings').set(bearer(player.token))).body).toHaveLength(3);
    expect((await t.http().post('/api/standings/import').set(KEY).send({ standings: [] })).body.teamsFound).toBe(0);
    const logs = await t.http().get('/api/standings/logs').query({ limit: 2 }).set(bearer(player.token));
    expect(logs.body).toHaveLength(2);
    expect((await t.http().post('/api/standings/sync').set(bearer(player.token))).status).toBe(403);
  });
});
