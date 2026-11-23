import type { ScrapedPoolMatch } from './scraped-pool-match';
import type { ScrapedCupMatch } from './scraped-cup-match';
import type { ScrapedStanding } from './scraped-standing';

/**
 * Championship and cup pages now live on epreuves.fff.fr, e.g.
 * https://epreuves.fff.fr/competition/engagement/455070-seniors-reserve-niv1/phase/1/1/accueil
 * (competition 455070, phase 1, poule 1 — the trailing tab doesn't matter). The site is an
 * Angular (Analog) app that serializes every API response it used to render the page into
 * `<script id="ng-state">`, keyed `analog_GET|/api/data/...`, and the browser calls the same
 * `/api/data/...` routes when navigating. Everything below reads that JSON, never the
 * rendered markup. Shapes confirmed against real pages saved on 2026-11-23 (Seniors Réserve
 * Niv1 poule A and Coupe des Flandres Réserve).
 */
export interface CompetitionTarget {
  origin: string;
  cpNo: string;
  phNo: string;
  gpNo: string;
}

export const COMPETITION_URL_PATTERN =
  /^https:\/\/epreuves\.fff\.fr\/competition\/engagement\/(\d+)-[^/?#]+\/phase\/(\d+)\/(\d+)(?:[/?#].*)?$/;

export const COMPETITION_URL_EXAMPLE =
  'https://epreuves.fff.fr/competition/engagement/455070-seniors-reserve-niv1/phase/1/1/accueil';

export function parseCompetitionUrl(url: string): CompetitionTarget | null {
  const match = COMPETITION_URL_PATTERN.exec(url.trim());
  if (!match) return null;
  return { origin: 'https://epreuves.fff.fr', cpNo: match[1], phNo: match[2], gpNo: match[3] };
}

export function matchesApiPath(target: CompetitionTarget, pjNo: string, page = 1): string {
  return (
    `/api/data/matches?cpNo=${target.cpNo}&phNo=${target.phNo}&gpNo=${target.gpNo}&pjNo=${pjNo}` +
    `&itemsPerPage=50&page=${page}&pagination=true`
  );
}

export function standingsApiPath(target: CompetitionTarget): string {
  return `/api/data/classement_journees?cpNo=${target.cpNo}&phNo=${target.phNo}&gpNo=${target.gpNo}`;
}

export interface Journee {
  pjNo: string;
  date: string | null;
  label: string;
}

interface FffClub {
  nom?: string;
  logo?: string | null;
}

interface FffSide {
  club?: FffClub;
  buts?: number | null;
}

export interface FffMatchDetail {
  maNo: number | string;
  date: string;
  joue?: boolean;
  journee?: { pjNo?: string; tourNom?: string };
  phase?: { phNo?: string };
  groupe?: { gpNo?: string };
  recevant?: FffSide;
  visiteur?: FffSide;
}

interface FffStandingRow {
  classement?: string;
  placeAffichage?: string;
  nomEquipe?: string;
  points?: string;
  nbMatch?: string;
  nbMatchGagne?: string;
  nbMatchNul?: string;
  nbMatchPe?: string;
  nbButPour?: string;
  nbButContre?: string;
  diffBut?: string;
}

type NgState = Record<string, unknown>;

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? (value as Record<string, any>) : null;
}

/** "Championnat" or "Coupe", from the competition's own record in the page state. */
export function competitionType(state: NgState, target: CompetitionTarget): string | null {
  const entry = asRecord(state[`analog_GET|/api/data/competitions/${target.cpNo}`]);
  return entry?.body?.donneesFormatees?.type ?? null;
}

/** Every journée (championship) or round (cup) of our poule, from the page's PHASE entry. */
export function journeesFromState(state: NgState, target: CompetitionTarget): Journee[] {
  const phase = asRecord(state.PHASE);
  const groups: any[] = Array.isArray(phase?.groupes) ? phase!.groupes : [];
  const group = groups.find((g) => String(g?.gpNo) === target.gpNo);
  const journees: any[] = Array.isArray(group?.journees) ? group.journees : [];
  return journees
    .filter((j) => j?.pjNo)
    .map((j) => ({
      pjNo: String(j.pjNo),
      date: typeof j.date === 'string' ? j.date.slice(0, 10) : null,
      label: j.tourNom ? String(j.tourNom) : `Journée ${j.pjNo}`,
    }));
}

/** Match records from any `matches` API response body (hydra collection). */
export function matchesFromBody(body: unknown): FffMatchDetail[] {
  const members: any[] = asRecord(body)?.['hydra:member'] ?? [];
  return members.map((m) => m?.donneesFormatees).filter((d): d is FffMatchDetail => !!d?.maNo && !!d?.date);
}

/** Match records already embedded in the page state (the week or round shown on load). */
export function matchesFromState(state: NgState): FffMatchDetail[] {
  return Object.entries(state)
    .filter(([key]) => key.startsWith('analog_GET|/api/data/matches?'))
    .flatMap(([, value]) => matchesFromBody(asRecord(value)?.body));
}

export function standingsBodyFromState(state: NgState): unknown {
  const entry = Object.entries(state).find(([key]) => key.startsWith('analog_GET|/api/data/classement_journees?'));
  return entry ? asRecord(entry[1])?.body : null;
}

/** Keeps only our poule's matches, one per FFF match id. */
export function dedupeMatches(matches: FffMatchDetail[], target: CompetitionTarget): FffMatchDetail[] {
  const byId = new Map<string, FffMatchDetail>();
  for (const m of matches) {
    if (m.phase?.phNo && String(m.phase.phNo) !== target.phNo) continue;
    if (m.groupe?.gpNo && String(m.groupe.gpNo) !== target.gpNo) continue;
    byId.set(String(m.maNo), m);
  }
  return [...byId.values()];
}

/** Same naming as the data already stored from the district pages: the trailing squad number
 * ("RONCHIN US 3") is dropped, so names keep matching our own matches and existing rows. */
export function cleanTeamName(raw: string | undefined): string {
  const text = (raw ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const match = /^(.*\S)\s+\d+$/.exec(text);
  return match ? match[1] : text;
}

interface BaseMatch {
  fffMatchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  played: boolean;
}

function toBaseMatch(m: FffMatchDetail): BaseMatch | null {
  const homeTeam = cleanTeamName(m.recevant?.club?.nom);
  const awayTeam = cleanTeamName(m.visiteur?.club?.nom);
  if (!homeTeam || !awayTeam) return null;
  const homeGoals = m.recevant?.buts;
  const awayGoals = m.visiteur?.buts;
  const played = m.joue === true && typeof homeGoals === 'number' && typeof awayGoals === 'number';
  return {
    fffMatchId: String(m.maNo),
    // Already in Paris time ("2026-11-15T08:30:00+01:00"), so the first 10 chars are the local date.
    date: m.date.slice(0, 10),
    homeTeam,
    awayTeam,
    homeLogo: m.recevant?.club?.logo ?? null,
    awayLogo: m.visiteur?.club?.logo ?? null,
    scoreHome: played ? homeGoals! : null,
    scoreAway: played ? awayGoals! : null,
    played,
  };
}

export function toPoolMatches(matches: FffMatchDetail[]): ScrapedPoolMatch[] {
  return matches.flatMap((m) => {
    const base = toBaseMatch(m);
    if (!base) return [];
    return [{ ...base, matchday: m.journee?.pjNo ? `Journée ${m.journee.pjNo}` : null }];
  });
}

export function toCupMatches(matches: FffMatchDetail[]): ScrapedCupMatch[] {
  return matches.flatMap((m) => {
    const base = toBaseMatch(m);
    if (!base) return [];
    const round = m.journee?.tourNom || (m.journee?.pjNo ? `Tour ${m.journee.pjNo}` : 'Tour');
    return [{ ...base, round }];
  });
}

/** The latest journée's table: the collection holds one entry per journée played, with ids
 * like "455070_1_1_6" (journée last). */
export function toStandings(body: unknown): ScrapedStanding[] {
  const members: any[] = asRecord(body)?.['hydra:member'] ?? [];
  const journeeOf = (m: any) => Number(String(m?.id ?? '').split('_').at(-1)) || 0;
  const latest = [...members].sort((a, b) => journeeOf(b) - journeeOf(a))[0];
  const rows: FffStandingRow[] = Array.isArray(latest?.donneesFormatees) ? latest.donneesFormatees : [];
  const num = (value: string | undefined) => Number(value) || 0;
  return rows
    .map((row) => ({
      rank: num(row.classement ?? row.placeAffichage),
      teamName: cleanTeamName(row.nomEquipe),
      points: num(row.points),
      played: num(row.nbMatch),
      won: num(row.nbMatchGagne),
      drawn: num(row.nbMatchNul),
      lost: num(row.nbMatchPe),
      goalsFor: num(row.nbButPour),
      goalsAgainst: num(row.nbButContre),
      goalDifference: num(row.diffBut),
    }))
    .filter((s) => s.teamName && s.rank > 0)
    .sort((a, b) => a.rank - b.rank);
}
