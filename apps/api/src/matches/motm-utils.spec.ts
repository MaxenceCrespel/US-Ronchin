import {
  computeMotmWinners,
  firstVoteAt,
  groupCompositionByUserIdPerMatch,
  isMotmRevealed,
  MOTM_REVEAL_DELAY_MS,
  resolveWinnerUserIds,
} from './motm-utils';

const vote = (
  votedForId: string | null,
  votedForGuestId: string | null = null,
  at = new Date(),
) => ({
  votedForId,
  votedForGuestId,
  createdAt: at,
});

describe('isMotmRevealed', () => {
  it('is hidden with no votes at all', () => {
    expect(isMotmRevealed([], 10)).toBe(false);
  });

  it('reveals as soon as everyone has voted', () => {
    const votes = Array.from({ length: 3 }, () => vote('a'));
    expect(isMotmRevealed(votes, 3)).toBe(true);
  });

  it('stays hidden before 24h if not everyone voted', () => {
    expect(isMotmRevealed([vote('a')], 10)).toBe(false);
  });

  it('reveals 24h after the first vote', () => {
    const old = new Date(Date.now() - MOTM_REVEAL_DELAY_MS - 1000);
    expect(isMotmRevealed([vote('a', null, old), vote('b')], 10)).toBe(true);
  });
});

describe('firstVoteAt', () => {
  it('returns null without votes and the earliest date otherwise', () => {
    expect(firstVoteAt([])).toBeNull();
    const early = new Date('2026-09-01T10:00:00Z');
    const late = new Date('2026-09-02T10:00:00Z');
    expect(
      firstVoteAt([vote('a', null, late), vote('b', null, early)]),
    ).toEqual(early);
  });
});

describe('computeMotmWinners', () => {
  const byUser = new Map([
    ['u1', { id: 'c1' }],
    ['u2', { id: 'c2' }],
  ]);

  it('returns every player tied for the top spot', () => {
    const winners = computeMotmWinners([vote('u1'), vote('u2')], byUser);
    expect(winners.sort()).toEqual(['c1', 'c2']);
  });

  it('merges a guest vote with a direct vote for the same composition entry', () => {
    // c1 = 1 guest vote + 1 direct vote = 2, c2 = 1 → c1 alone wins, no false tie
    const winners = computeMotmWinners(
      [vote(null, 'c1'), vote('u1'), vote('u2')],
      byUser,
    );
    expect(winners).toEqual(['c1']);
  });

  it('ignores blank votes and targets no longer in the composition', () => {
    expect(computeMotmWinners([vote(null), vote('gone')], byUser)).toEqual([]);
  });

  it('is empty without votes', () => {
    expect(computeMotmWinners([], byUser)).toEqual([]);
  });
});

describe('resolveWinnerUserIds', () => {
  it('drops still-unlinked guests', () => {
    const byId = new Map([
      ['c1', { userId: 'u1' }],
      ['c2', { userId: null }],
    ]);
    expect(resolveWinnerUserIds(['c1', 'c2', 'missing'], byId)).toEqual(['u1']);
  });
});

describe('groupCompositionByUserIdPerMatch', () => {
  it('groups by match then user and skips guests', () => {
    const grouped = groupCompositionByUserIdPerMatch([
      { id: 'c1', matchId: 'm1', userId: 'u1' },
      { id: 'c2', matchId: 'm1', userId: null },
      { id: 'c3', matchId: 'm2', userId: 'u1' },
    ]);
    expect(grouped.get('m1')?.get('u1')?.id).toBe('c1');
    expect(grouped.get('m1')?.size).toBe(1);
    expect(grouped.get('m2')?.get('u1')?.id).toBe('c3');
  });
});
