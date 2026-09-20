import {
  getCurrentSeasonLabel,
  getSeasonBounds,
  isInSeason,
  previousSeasonLabel,
} from './season.util';

describe('season utils', () => {
  it('starts a season on 1 August', () => {
    expect(getCurrentSeasonLabel(new Date(2026, 7, 1))).toBe('2026-2027');
    expect(getCurrentSeasonLabel(new Date(2026, 6, 31))).toBe('2025-2026');
    expect(getCurrentSeasonLabel(new Date(2027, 0, 15))).toBe('2026-2027');
  });

  it('bounds run 1 Aug → 31 Jul', () => {
    expect(getSeasonBounds('2026-2027')).toEqual({
      start: '2026-08-01',
      end: '2027-07-31',
    });
  });

  it('checks membership inclusively at both ends', () => {
    const b = getSeasonBounds('2026-2027');
    expect(isInSeason('2026-08-01', b)).toBe(true);
    expect(isInSeason('2027-07-31', b)).toBe(true);
    expect(isInSeason('2026-07-31', b)).toBe(false);
    expect(isInSeason('2027-08-01', b)).toBe(false);
  });

  it('finds the previous season', () => {
    expect(previousSeasonLabel('2026-2027')).toBe('2025-2026');
  });
});
