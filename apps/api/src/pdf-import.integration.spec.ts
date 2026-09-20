import { bearer, createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { UserRole } from './users/entities/user.entity';

jest.mock('pdf-parse', () => ({
  PDFParse: class {
    getText() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return Promise.resolve({ text: require('./test-utils/sample-sheet').SAMPLE_SHEET });
    }
    destroy() {
      return Promise.resolve();
    }
  },
}));

describe('match sheet import (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let player: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    coach = await t.createUser({ role: UserRole.COACH });
    player = await t.createUser({ firstName: 'Vincent', lastName: 'Ringalle' });
  });
  afterAll(() => t.close());

  it('parses an uploaded sheet and matches our players', async () => {
    const res = await t
      .http()
      .post('/api/matches/pdf-import')
      .set(bearer(coach.token))
      .attach('file', Buffer.from('%PDF-fake'), { filename: 'sheet.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.matchInfo).toMatchObject({
      fffMatchId: '12345678',
      date: '2026-09-06',
      opponent: 'FC ADVERSE',
      homeAway: 'HOME',
      scoreHome: 3,
      scoreAway: 1,
    });
    expect(res.body.composition).toHaveLength(5);
    expect(res.body.composition.find((c: { pdfName: string }) => c.pdfName === 'RINGALLE Vincent').matchedUserId).toBe(player.user.id);
    // only our goals/cards are kept
    expect(res.body.goals).toHaveLength(3);
    expect(res.body.goals[0]).toMatchObject({ matchedUserId: player.user.id, goalType: 'FOOT' });
    expect(res.body.cards).toHaveLength(1);
  });

  it('is coach-only and needs a file', async () => {
    expect((await t.http().post('/api/matches/pdf-import').set(bearer(player.token)).attach('file', Buffer.from('x'), 'a.pdf')).status).toBe(403);
    expect((await t.http().post('/api/matches/pdf-import').set(bearer(coach.token))).status).toBeGreaterThanOrEqual(400);
  });
});
