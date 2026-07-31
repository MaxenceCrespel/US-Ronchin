import type {
  ParsedCard,
  ParsedGoal,
  ParsedMatchHeader,
  ParsedMatchSheet,
  ParsedPlayerLine,
} from './parsed-match-sheet';

/**
 * Parses the plain text extracted from an official FFF "feuille de match" PDF
 * (footclub.fff.fr). The layout is a fixed template (Ligue Hauts-de-France),
 * but text extraction order for wrapped/tabular cells can vary between PDF
 * producers — this parser was calibrated on two real sample sheets and is
 * expected to need adjustment once tested against a real upload.
 */

const GOAL_TYPES = ['Du pied', 'De la tête', 'Contre son camp', 'Pénalty'];
const GOAL_ACTIONS = ['Aucune', 'Corner', 'Centre', 'Coup franc', 'Penalty', 'Touche'];

const RED_CARD_KEYWORDS = [
  'faute grossière',
  'cracher',
  "priver l'équipe adverse",
  'priver une équipe adverse',
  'raciste',
  'violence',
  'brutalité',
];

function normalizeText(text: string): string {
  return text.replace(/’/g, "'").replace(/\r\n/g, '\n');
}

function sliceBetween(text: string, startMarker: string, endMarkers: string[]): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return null;
  const from = startIndex + startMarker.length;

  let endIndex = text.length;
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, from);
    if (idx !== -1 && idx < endIndex) endIndex = idx;
  }
  return text.slice(from, endIndex).trim();
}

function toLines(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// The jersey number is a single column shared by both teams' name cells on the same row
// (e.g. "1 RINGALLE Vincent 2498314959" for the home player of row 1) — text extraction only
// keeps it attached to the home-side cell, so the away-side cell on the same row has no
// leading number at all (e.g. "BERLIVET Guillaume 2544696502"). The number is therefore optional.
const PLAYER_LINE =
  /^(?:(\d{1,2})\s+)?(.+?)(\s+\(Capitaine\))?\s+(\d{9,10})(?:\s+N'a pas particip[ée])?\s*$/;

interface GroupedPlayerLine extends ParsedPlayerLine {
  groupKey: number;
}

function parsePlayerLines(lines: string[], isStarter: boolean): GroupedPlayerLine[] {
  const players: GroupedPlayerLine[] = [];
  let unnumberedRun = 0;
  for (const line of lines) {
    const match = PLAYER_LINE.exec(line);
    if (!match) continue;

    const jerseyNumber = match[1] ? Number(match[1]) : null;
    unnumberedRun = jerseyNumber !== null ? 0 : unnumberedRun + 1;
    const groupKey = jerseyNumber ?? unnumberedRun;

    players.push({
      jerseyNumber,
      groupKey,
      name: match[2].trim(),
      isCaptain: Boolean(match[3]),
      licenseNumber: match[4],
      isStarter,
      participated: !line.includes("N'a pas participé"),
    });
  }
  return players;
}

/** Splits a flat list of player lines into per-team groups, using groupKey resets as boundaries
 * (the away team's rows restart their own 1..N run right where the home team's numbers end). */
function splitByTeam(players: GroupedPlayerLine[]): ParsedPlayerLine[][] {
  const groups: ParsedPlayerLine[][] = [];
  let previousKey = Infinity;
  for (const { groupKey, ...player } of players) {
    if (groupKey <= previousKey) {
      groups.push([]);
    }
    groups[groups.length - 1].push(player);
    previousKey = groupKey;
  }
  return groups;
}

function parseHeader(text: string): ParsedMatchHeader {
  const matchIdMatch = /Information du Match N°\s*(\d+)/.exec(text);
  const dateMatch = /Date\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}h\d{2})/.exec(text);
  // Venue usually shares its line with the score, e.g. "Terrain : STADE D' AVELGHEM 1 1 Résultat 3 Non Joué :".
  // But when the match was rescheduled ("Match reporté du : ..."), that line is inserted between the
  // venue and the score, pushing "N Résultat N" onto its own line — so the two are parsed independently.
  const venueLineMatch = /Terrain\s*:\s*([^\n]+)/.exec(text);
  const venue = venueLineMatch
    ? venueLineMatch[1].replace(/\s+\d+\s+Résultat\s+\d+.*$/, '').trim()
    : null;
  const scoreMatch = /(\d+)\s+Résultat\s+(\d+)/.exec(text);

  const teamsLine =
    /Equipe Recevante\s+Equipe Visiteuse\s*\n(.+?)\s+-\s+\d{4,7}\s+(.+?)\s+-\s+\d{4,7}/.exec(text);

  const competitionRaw = sliceBetween(text, 'Compétition :', ['Arrêté']);
  // The competition line typically wraps onto exactly one continuation line before
  // the (unmarked) team-names line — keep only the first two non-empty lines.
  const competition = competitionRaw
    ? toLines(competitionRaw).slice(0, 2).join(' ').replace(/\s+/g, ' ').trim()
    : null;

  return {
    fffMatchId: matchIdMatch ? matchIdMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
    kickOffTime: dateMatch ? dateMatch[2].replace('h', ':') : null,
    competition,
    venue,
    homeTeamName: teamsLine ? teamsLine[1].trim() : null,
    awayTeamName: teamsLine ? teamsLine[2].trim() : null,
    scoreHome: scoreMatch ? Number(scoreMatch[1]) : null,
    scoreAway: scoreMatch ? Number(scoreMatch[2]) : null,
  };
}

/** Joins wrapped lines belonging to the same logical row until a trailing "N'" (or "N' + N'") minute marker is found. */
function joinWrappedRows(lines: string[], rowStartPattern: RegExp): string[] {
  const rows: string[] = [];
  let buffer: string[] = [];

  const minuteEnd = /\d+'(?:\s*\+\s*\d+')?\s*$/;

  for (const line of lines) {
    if (rowStartPattern.test(line) && buffer.length > 0) {
      rows.push(buffer.join(' '));
      buffer = [];
    }
    buffer.push(line);
    if (minuteEnd.test(line)) {
      rows.push(buffer.join(' '));
      buffer = [];
    }
  }
  if (buffer.length > 0) rows.push(buffer.join(' '));

  return rows;
}

const ROW_START_WITH_LICENSE = /^.+?\s\d{9,10}\s/;

function parseGoals(section: string): ParsedGoal[] {
  const rows = joinWrappedRows(toLines(section), ROW_START_WITH_LICENSE);
  const goals: ParsedGoal[] = [];

  const goalTypeAlternation = GOAL_TYPES.join('|');
  const rowPattern = new RegExp(
    `^(.+?)\\s+(\\d{9,10})\\s+(\\d{1,2})\\s+-\\s+(.+?)\\s+(${goalTypeAlternation})\\s+(.*?)\\s+(\\d+)'(?:\\s*\\+\\s*\\d+')?\\s*$`,
  );

  for (const row of rows) {
    const match = rowPattern.exec(row);
    if (!match) continue;

    const rest = match[6].trim();
    const knownAction = GOAL_ACTIONS.find((a) => rest === a || rest.startsWith(`${a} `));
    const actionPrecedente = knownAction ?? rest;
    const passeurName = knownAction ? rest.slice(knownAction.length).trim() || null : null;

    goals.push({
      teamName: match[1].trim(),
      licenseNumber: match[2],
      jerseyNumber: Number(match[3]),
      playerName: match[4].trim(),
      goalType: match[5],
      actionPrecedente,
      passeurName,
      minute: Number(match[7]),
    });
  }

  return goals;
}

const NAME_PATTERN = "([A-ZÀ-Ü'\\- ]+?\\s+[A-ZÀ-Ü][a-zà-ÿ'\\-]+)";

function parseCards(section: string): ParsedCard[] {
  const rows = joinWrappedRows(toLines(section), ROW_START_WITH_LICENSE);
  const cards: ParsedCard[] = [];

  const rowPattern = new RegExp(
    `^(.+?)\\s+(\\d{9,10})\\s+(?:(\\d{1,2})\\s+-\\s+)?${NAME_PATTERN}\\s+(.+?)\\s+(\\d+)'(?:\\s*\\+\\s*\\d+')?\\s*$`,
  );

  for (const row of rows) {
    const match = rowPattern.exec(row);
    if (!match) continue;

    const motif = match[5].trim();
    const normalizedMotif = motif.toLowerCase();
    const isRed = RED_CARD_KEYWORDS.some((k) => normalizedMotif.includes(k));

    cards.push({
      teamName: match[1].trim(),
      licenseNumber: match[2],
      jerseyNumber: match[3] ? Number(match[3]) : null,
      playerName: match[4].trim(),
      motif,
      cardType: isRed ? 'RED_CARD' : 'YELLOW_CARD',
      needsReview: !isRed,
      minute: Number(match[6]),
    });
  }

  return cards;
}

export function parseMatchSheet(rawText: string): ParsedMatchSheet {
  const text = normalizeText(rawText);

  const header = parseHeader(text);

  const compositionSection = sliceBetween(text, 'COMPOSITION', ['REMPLAÇANTS', 'BANC']) ?? '';
  const remplacantsSection = sliceBetween(text, 'REMPLAÇANTS', ['BANC']) ?? '';
  const buteursSection = sliceBetween(text, 'BUTEURS', ['REGLEMENTS LOCAUX', 'ORGANISATION']) ?? '';
  const disciplineSection =
    sliceBetween(text, 'DISCIPLINE', ['BLESSURES', 'SECURITE', 'BUTEURS']) ?? '';

  const startersGroups = splitByTeam(parsePlayerLines(toLines(compositionSection), true));
  const substitutesGroups = splitByTeam(parsePlayerLines(toLines(remplacantsSection), false));

  const homeComposition = [...(startersGroups[0] ?? []), ...(substitutesGroups[0] ?? [])];
  const awayComposition = [...(startersGroups[1] ?? []), ...(substitutesGroups[1] ?? [])];

  const goals = parseGoals(buteursSection);
  const cards = parseCards(disciplineSection);

  return { header, homeComposition, awayComposition, goals, cards };
}
