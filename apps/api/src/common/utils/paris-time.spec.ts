import { parisDateOnly, parisToday, parisWallTimeToDate } from './paris-time';

describe('parisWallTimeToDate', () => {
  it('applies CEST (UTC+2) in summer', () => {
    expect(parisWallTimeToDate('2026-09-03', '20:30').toISOString()).toBe(
      '2026-09-03T18:30:00.000Z',
    );
  });

  it('applies CET (UTC+1) in winter', () => {
    expect(parisWallTimeToDate('2026-12-03', '20:30:00').toISOString()).toBe(
      '2026-12-03T19:30:00.000Z',
    );
  });

  it('follows the DST switch day by day (last Sunday of March 2027)', () => {
    expect(parisWallTimeToDate('2027-03-27', '12:00').toISOString()).toBe(
      '2027-03-27T11:00:00.000Z',
    );
    expect(parisWallTimeToDate('2027-03-28', '12:00').toISOString()).toBe(
      '2027-03-28T10:00:00.000Z',
    );
  });
});

describe('parisDateOnly / parisToday', () => {
  it("uses Paris' calendar date, not UTC's, late in the evening", () => {
    // 22:30 UTC on 1 Sept = 00:30 on 2 Sept in Paris (summer)
    expect(parisDateOnly(new Date('2026-09-01T22:30:00Z'))).toBe('2026-09-02');
    expect(parisDateOnly(new Date('2026-09-01T21:30:00Z'))).toBe('2026-09-01');
  });

  it('parisToday follows the clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T22:30:00Z'));
    try {
      expect(parisToday()).toBe('2026-09-02');
    } finally {
      jest.useRealTimers();
    }
  });
});
