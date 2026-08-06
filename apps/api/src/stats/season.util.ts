const SEASON_START_MONTH_INDEX = 7; // August, 0-indexed

export interface SeasonBounds {
  start: string;
  end: string;
}

/** "2026-2027" for anything from 2026-08-01 through 2027-07-31. */
export function getCurrentSeasonLabel(ref: Date = new Date()): string {
  const year = ref.getFullYear();
  const startYear = ref.getMonth() >= SEASON_START_MONTH_INDEX ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getSeasonBounds(label: string): SeasonBounds {
  const [startYear] = label.split('-').map(Number);
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
  };
}

export function isInSeason(date: string, bounds: SeasonBounds): boolean {
  return date >= bounds.start && date <= bounds.end;
}
