import type { User } from '../users/entities/user.entity';
import { MatchHomeAway } from '../matches/entities/match.entity';
import type { ParsedPlayerLine } from './parsed-match-sheet';

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamNameMatches(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  return na.startsWith(nb) || nb.startsWith(na);
}

/** Matches a "NOM Prénom" string from a PDF sheet against known app users, by license first, then name. */
export function matchUser(
  pdfName: string,
  licenseNumber: string | null,
  users: User[],
): User | null {
  if (licenseNumber) {
    const byLicense = users.find((u) => u.licenseNumber === licenseNumber);
    if (byLicense) return byLicense;
  }

  const normalizedPdfName = normalize(pdfName);
  const byName = users.find(
    (u) => normalize(`${u.lastName} ${u.firstName}`) === normalizedPdfName,
  );
  return byName ?? null;
}

/**
 * Determines which side (home/away) is our club, first by matching a configured
 * club name against the team names, falling back to whichever side's roster has
 * more players matching existing app accounts.
 */
export function detectOurSide(
  homeTeamName: string | null,
  awayTeamName: string | null,
  homeComposition: ParsedPlayerLine[],
  awayComposition: ParsedPlayerLine[],
  users: User[],
  clubName: string,
): MatchHomeAway {
  const normalizedClub = normalize(clubName);
  if (homeTeamName && normalize(homeTeamName).includes(normalizedClub)) return MatchHomeAway.HOME;
  if (awayTeamName && normalize(awayTeamName).includes(normalizedClub)) return MatchHomeAway.AWAY;

  const countMatches = (players: ParsedPlayerLine[]) =>
    players.filter((p) => matchUser(p.name, p.licenseNumber, users) !== null).length;

  return countMatches(homeComposition) >= countMatches(awayComposition)
    ? MatchHomeAway.HOME
    : MatchHomeAway.AWAY;
}
