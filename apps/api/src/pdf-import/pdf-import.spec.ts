import { parseMatchSheet } from './pdf-sheet-parser';
import { detectOurSide, matchUser, normalize, teamNameMatches } from './player-matching';
import { SAMPLE_SHEET } from '../test-utils/sample-sheet';
import { MatchHomeAway } from '../matches/entities/match.entity';
import type { User } from '../users/entities/user.entity';

describe('parseMatchSheet', () => {
  const sheet = parseMatchSheet(SAMPLE_SHEET);

  it('reads the match header', () => {
    expect(sheet.header).toMatchObject({
      fffMatchId: '12345678',
      date: '06/09/2026',
      kickOffTime: '15:00',
      venue: 'STADE DES TESTS',
      homeTeamName: 'US RONCHIN',
      awayTeamName: 'FC ADVERSE',
      scoreHome: 3,
      scoreAway: 1,
    });
    expect(sheet.header.competition).toContain('D6 Poule A');
  });

  it('splits starters and substitutes per team', () => {
    expect(sheet.homeComposition.map((p) => p.name)).toEqual([
      'RINGALLE Vincent',
      'CRESPEL Maxence',
      'THIERRY Raphael',
      'KARADA Mohamed',
      'ASSAL Youssef',
    ]);
    expect(sheet.awayComposition.map((p) => p.name)).toEqual(['DUPONT Jean', 'MARTIN Paul', 'REMPLAÇANT Adverse']);
  });

  it('flags the captain, licence, starters and non-participants', () => {
    const captain = sheet.homeComposition.find((p) => p.name === 'CRESPEL Maxence')!;
    expect(captain).toMatchObject({ isCaptain: true, licenseNumber: '2498314960', jerseyNumber: 2, isStarter: true });
    const bench = sheet.homeComposition.find((p) => p.name === 'KARADA Mohamed')!;
    expect(bench.isStarter).toBe(false);
    expect(sheet.homeComposition.find((p) => p.name === 'ASSAL Youssef')!.participated).toBe(false);
    expect(bench.participated).toBe(true);
  });

  it('parses goals with type, assist and minute', () => {
    expect(sheet.goals).toHaveLength(4);
    expect(sheet.goals[0]).toMatchObject({
      teamName: 'US RONCHIN',
      playerName: 'RINGALLE Vincent',
      goalType: 'Du pied',
      actionPrecedente: 'Corner',
      passeurName: 'CRESPEL Maxence',
      minute: 12,
    });
    expect(sheet.goals[1]).toMatchObject({ goalType: 'Pénalty', passeurName: null });
    expect(sheet.goals[3].teamName).toBe('FC ADVERSE');
  });

  it('parses cards and marks serious motives red, the rest for review', () => {
    expect(sheet.cards).toHaveLength(2);
    expect(sheet.cards[0]).toMatchObject({ cardType: 'YELLOW_CARD', needsReview: true, minute: 55, jerseyNumber: 2 });
    expect(sheet.cards[1]).toMatchObject({ cardType: 'RED_CARD', needsReview: false, minute: 70 });
  });

  it('joins a row wrapped over two lines and tolerates added time', () => {
    const wrapped = SAMPLE_SHEET.replace(
      "US RONCHIN 2498314959 1 - RINGALLE Vincent Du pied Corner CRESPEL Maxence 12'",
      "US RONCHIN 2498314959 1 - RINGALLE Vincent Du pied Corner\nCRESPEL Maxence 90' + 3'",
    );
    const goal = parseMatchSheet(wrapped).goals[0];
    expect(goal.playerName).toBe('RINGALLE Vincent');
    expect(goal.passeurName).toBe('CRESPEL Maxence');
    expect(goal.minute).toBe(90);
  });

  it('degrades gracefully on garbage', () => {
    const empty = parseMatchSheet('nothing useful here');
    expect(empty.header.fffMatchId).toBeNull();
    expect(empty.header.scoreHome).toBeNull();
    expect(empty.homeComposition).toEqual([]);
    expect(empty.goals).toEqual([]);
    expect(empty.cards).toEqual([]);
  });

  it('copes with a rescheduled match line pushing the score onto its own line', () => {
    const text = SAMPLE_SHEET.replace(
      'Terrain : STADE DES TESTS 3 Résultat 1 Non Joué :',
      'Terrain : STADE DES TESTS\nMatch reporté du : 01/09/2026\n2 Résultat 2',
    );
    const h = parseMatchSheet(text).header;
    expect(h.venue).toBe('STADE DES TESTS');
    expect([h.scoreHome, h.scoreAway]).toEqual([2, 2]);
  });
});

describe('player matching', () => {
  const user = (over: Partial<User>) => ({ id: 'u', firstName: 'A', lastName: 'B', licenseNumber: null, ...over }) as User;

  it('normalizes accents, case and punctuation', () => {
    expect(normalize("  d'Éric-Élodie  ")).toBe('D ERIC ELODIE');
  });

  it('matches team names by prefix either way, never on null', () => {
    expect(teamNameMatches('US RONCHIN 2', 'us ronchin')).toBe(true);
    expect(teamNameMatches('US RONCHIN', 'US RONCHIN 2')).toBe(true);
    expect(teamNameMatches('FC ADVERSE', 'US RONCHIN')).toBe(false);
    expect(teamNameMatches(null, 'x')).toBe(false);
  });

  it('matches a user by licence first, then by "NOM Prénom"', () => {
    const users = [
      user({ id: 'lic', lastName: 'Autre', firstName: 'Nom', licenseNumber: '2498314959' }),
      user({ id: 'name', lastName: 'Crespel', firstName: 'Maxence' }),
    ];
    expect(matchUser('WHATEVER', '2498314959', users)?.id).toBe('lic');
    expect(matchUser('CRESPEL Maxence', null, users)?.id).toBe('name');
    expect(matchUser('CRESPEL Maxence', '0000000000', users)?.id).toBe('name');
    expect(matchUser('Inconnu Total', null, users)).toBeNull();
  });

  it('finds our side by club name, then by roster overlap', () => {
    const users = [user({ id: 'u1', lastName: 'Ringalle', firstName: 'Vincent' })];
    const home = [{ name: 'RINGALLE Vincent', licenseNumber: '1' }] as never;
    const away = [{ name: 'DUPONT Jean', licenseNumber: '2' }] as never;
    expect(detectOurSide('US RONCHIN', 'FC X', home, away, users, 'Ronchin')).toBe(MatchHomeAway.HOME);
    expect(detectOurSide('FC X', 'US RONCHIN', away, home, users, 'Ronchin')).toBe(MatchHomeAway.AWAY);
    expect(detectOurSide('A', 'B', away, home, users, 'Nothing')).toBe(MatchHomeAway.AWAY);
    expect(detectOurSide(null, null, home, away, users, 'Nothing')).toBe(MatchHomeAway.HOME);
  });
});
