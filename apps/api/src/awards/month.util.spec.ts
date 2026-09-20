import {
  monthBounds,
  monthLabel,
  monthLabelDisplay,
  previousMonthLabel,
} from './month.util';

describe('month utils', () => {
  it('labels a date by its calendar month', () => {
    expect(monthLabel('2026-09-20')).toBe('2026-09');
  });

  it('goes back one month and wraps the year in January', () => {
    expect(previousMonthLabel('2026-09')).toBe('2026-08');
    expect(previousMonthLabel('2026-01')).toBe('2025-12');
  });

  it('gives the calendar-day range including leap years', () => {
    expect(monthBounds('2026-09')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(monthBounds('2028-02')).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
    expect(monthBounds('2027-02').end).toBe('2027-02-28');
  });

  it('formats the label in French', () => {
    expect(monthLabelDisplay('2026-09')).toBe('septembre 2026');
  });
});
