import {
  competitionType,
  dedupeMatches,
  journeesFromState,
  matchesApiPath,
  matchesFromState,
  parseCompetitionUrl,
  standingsBodyFromState,
  toCupMatches,
  toPoolMatches,
  toStandings,
} from './fff-competition';

// Trimmed copies of the JSON embedded in real epreuves.fff.fr pages (saved 2026-11-23).
const side = (nom: string, buts: number, logoId: string) => ({
  club: { nom, nomAbr: nom, logo: `https://cdn-transverse.azureedge.net/phlogos/BC${logoId}.jpg` },
  buts,
  tirBut: 0,
  resu: 'GA',
});
const match = (maNo: number, date: string, pjNo: string, home: string, away: string, joue = true, gpNo = '1') => ({
  donneesFormatees: {
    maNo,
    date,
    joue,
    journee: { pjNo, tourNom: pjNo === '1' ? '1er tour' : '' },
    phase: { phNo: '1' },
    groupe: { gpNo },
    recevant: side(home, joue ? 1 : 0, '500112'),
    visiteur: side(away, joue ? 2 : 0, '554197'),
  },
});
const collection = (...members: unknown[]) => ({ body: { 'hydra:totalItems': members.length, 'hydra:member': members } });

const state = {
  'analog_GET|/api/data/competitions/455070': { body: { donneesFormatees: { type: 'Championnat' } } },
  PHASE: {
    groupes: [
      { gpNo: '1', journees: [{ pjNo: '1', date: '2026-09-20T00:00:00+00:00' }, { pjNo: '6', date: '2026-11-15T00:00:00+00:00' }] },
      { gpNo: '2', journees: [{ pjNo: '1', date: '2026-09-20T00:00:00+00:00' }] },
    ],
  },
  'analog_GET|/api/data/matches?cpNo=455070&phNo=1&gpNo=1&dateDebut=2026-11-09': collection(
    match(79429392, '2026-11-15T08:30:00+01:00', '6', 'RONCHIN US 3', 'BONDUES FC 5'),
    match(79429999, '2026-11-15T09:00:00+01:00', '6', 'OTHER POULE 2', 'ELSEWHERE FC', true, '2'),
  ),
  'analog_GET|/api/data/classement_journees?cpNo=455070&phNo=1&gpNo=1': {
    body: {
      'hydra:member': [
        { id: '455070_1_1_5', donneesFormatees: [{ classement: '1', nomEquipe: 'OLD 2', points: '1' }] },
        {
          id: '455070_1_1_6',
          donneesFormatees: [
            { classement: '5', nomEquipe: 'RONCHIN US 3', points: '7', nbMatch: '6', nbMatchGagne: '2', nbMatchNul: '2', nbMatchPe: '2', nbButPour: '18', nbButContre: '18', diffBut: '0' },
            { classement: '1', nomEquipe: 'BONDUES FC 5', points: '18', nbMatch: '6', nbMatchGagne: '6', nbMatchNul: '0', nbMatchPe: '0', nbButPour: '32', nbButContre: '8', diffBut: '24' },
          ],
        },
      ],
    },
  },
};

describe('fff-competition', () => {
  const target = parseCompetitionUrl(
    'https://epreuves.fff.fr/competition/engagement/455070-seniors-reserve-niv1/phase/1/1/accueil',
  )!;

  it('reads competition, phase and poule from any tab of the page', () => {
    expect(target).toEqual({ origin: 'https://epreuves.fff.fr', cpNo: '455070', phNo: '1', gpNo: '1' });
    expect(
      parseCompetitionUrl('https://epreuves.fff.fr/competition/engagement/459041-coupe-des-flandres-reserve/phase/1/2'),
    ).toMatchObject({ cpNo: '459041', gpNo: '2' });
    expect(parseCompetitionUrl('https://flandres.fff.fr/competitions?id=455070&poule=1&phase=1&type=ch')).toBeNull();
    expect(parseCompetitionUrl('https://epreuves.fff.fr/competition/club/500112-ronchin-us-3/equipe/x')).toBeNull();
    expect(matchesApiPath(target, '6')).toBe(
      '/api/data/matches?cpNo=455070&phNo=1&gpNo=1&pjNo=6&itemsPerPage=50&page=1&pagination=true',
    );
  });

  it('lists our poule journées and the competition type', () => {
    expect(competitionType(state, target)).toBe('Championnat');
    expect(journeesFromState(state, target)).toEqual([
      { pjNo: '1', date: '2026-09-20', label: 'Journée 1' },
      { pjNo: '6', date: '2026-11-15', label: 'Journée 6' },
    ]);
  });

  it('maps pool matches, dropping other poules and duplicates', () => {
    const raw = [...matchesFromState(state), ...matchesFromState(state)];
    expect(toPoolMatches(dedupeMatches(raw, target))).toEqual([
      {
        fffMatchId: '79429392',
        date: '2026-11-15',
        matchday: 'Journée 6',
        homeTeam: 'RONCHIN US',
        awayTeam: 'BONDUES FC',
        homeLogo: 'https://cdn-transverse.azureedge.net/phlogos/BC500112.jpg',
        awayLogo: 'https://cdn-transverse.azureedge.net/phlogos/BC554197.jpg',
        scoreHome: 1,
        scoreAway: 2,
        played: true,
      },
    ]);
  });

  it('leaves the score empty for a match not played yet, and names cup rounds', () => {
    const [cup] = toCupMatches([match(79686888, '2027-02-21T10:00:00+01:00', '1', 'LILLE AFS GUINEE 2', 'RONCHIN US 3', false).donneesFormatees]);
    expect(cup).toMatchObject({ round: '1er tour', date: '2027-02-21', played: false, scoreHome: null, scoreAway: null });
  });

  it('takes the latest journée standings, sorted by rank', () => {
    const standings = toStandings(standingsBodyFromState(state));
    expect(standings.map((s) => [s.rank, s.teamName, s.points])).toEqual([
      [1, 'BONDUES FC', 18],
      [5, 'RONCHIN US', 7],
    ]);
    expect(standings[1]).toMatchObject({ played: 6, won: 2, drawn: 2, lost: 2, goalsFor: 18, goalsAgainst: 18, goalDifference: 0 });
  });
});
