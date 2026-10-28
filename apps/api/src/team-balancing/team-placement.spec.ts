import { pickTeamForNewcomer, separatedPartnersOf, teamsForNewcomer } from './team-placement';

describe('separatedPartnersOf', () => {
  it('finds a player on either side of a rule', () => {
    const rules = [
      { userAId: 'a', userBId: 'b' },
      { userAId: 'c', userBId: 'a' },
      { userAId: 'x', userBId: 'y' },
    ];
    expect([...separatedPartnersOf('a', rules)].sort()).toEqual(['b', 'c']);
    expect(separatedPartnersOf('z', rules).size).toBe(0);
  });
});

describe('pickTeamForNewcomer', () => {
  it('takes the smallest team', () => {
    expect(pickTeamForNewcomer([5, 3], new Set())).toBe(1);
  });

  it('takes the lowest index on a tie', () => {
    expect(pickTeamForNewcomer([4, 4], new Set())).toBe(0);
  });

  it('skips a team holding a separated partner when another is at most one player bigger', () => {
    expect(pickTeamForNewcomer([4, 5], new Set([0]))).toBe(1);
    expect(pickTeamForNewcomer([4, 4], new Set([0]))).toBe(1);
  });

  it('keeps headcount first: will not unbalance by two just to honour a rule', () => {
    expect(pickTeamForNewcomer([3, 5], new Set([0]))).toBe(0);
  });

  it('puts the newcomer on the smallest team when every team is in conflict', () => {
    expect(pickTeamForNewcomer([4, 5], new Set([0, 1]))).toBe(0);
  });

  it('works with more than two teams', () => {
    expect(pickTeamForNewcomer([3, 3, 4], new Set([0, 1]))).toBe(2);
  });
});

describe('teamsForNewcomer', () => {
  it('reads the partner conflicts and headcounts from the current assignments', () => {
    const assignments = [
      { userId: 'karim', teamIndex: 0 },
      { userId: 'x', teamIndex: 0 },
      { userId: 'y', teamIndex: 1 },
      { userId: null, teamIndex: 1 }, // a guest slot counts toward headcount
    ];
    expect(teamsForNewcomer(assignments, 2, new Set(['karim']))).toBe(1);
    expect(teamsForNewcomer(assignments, 2, new Set())).toBe(0);
  });
});
