/** Mirrors the API's own season.util.ts — a season runs 1 August through 31 July. */
export interface SeasonBounds {
  start: string
  end: string
}

/** "2026-08-01"/"2027-07-31" for label "2026-2027". */
export function getSeasonBounds(label: string): SeasonBounds {
  const [startYear] = label.split('-').map(Number)
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` }
}

export function isInSeason(date: string, bounds: SeasonBounds): boolean {
  return date >= bounds.start && date <= bounds.end
}

/** Same idea as isInSeason but for a "YYYY-MM" month label instead of a full date — string
 * comparison works here too since a season's month range never wraps oddly (it's always
 * exactly "YYYY-08" through "YYYY+1-07"). Used to decide which match/month trophies belong
 * to the *current* season for the trophy case — match and monthly trophies reset at each new
 * season (though the underlying data stays archived, nothing is deleted), unlike the season
 * trophies themselves, which stay visible forever. */
export function isMonthInSeason(month: string, seasonLabel: string): boolean {
  const bounds = getSeasonBounds(seasonLabel)
  return month >= bounds.start.slice(0, 7) && month <= bounds.end.slice(0, 7)
}
