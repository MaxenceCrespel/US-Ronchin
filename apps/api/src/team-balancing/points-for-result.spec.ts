import { MAX_POINTS_PER_SESSION, pointsForResult } from './points-for-result';

describe('pointsForResult', () => {
  it('gives 1 point each on a draw', () => {
    expect(pointsForResult(2, 2)).toEqual([1, 1]);
    expect(pointsForResult(0, 0)).toEqual([1, 1]);
  });

  it('gives 3 + goal difference to the winner and 0 to the loser, either side', () => {
    expect(pointsForResult(3, 1)).toEqual([5, 0]);
    expect(pointsForResult(1, 3)).toEqual([0, 5]);
  });

  it('caps the blowout bonus at 5', () => {
    expect(pointsForResult(12, 0)).toEqual([MAX_POINTS_PER_SESSION, 0]);
    expect(pointsForResult(0, 6)).toEqual([0, MAX_POINTS_PER_SESSION]);
  });
});
