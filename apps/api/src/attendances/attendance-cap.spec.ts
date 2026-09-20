import { pickNextWaitlisted, priorityRank } from './attendance-cap';
import { SeniorityTier } from '../users/entities/user.entity';

const user = (isLicensed: boolean, seniorityTier: SeniorityTier | null) => ({
  isLicensed,
  seniorityTier,
});
const entry = (id: string, u: ReturnType<typeof user>, minutesAgo: number) => ({
  id,
  user: u,
  respondedAt: new Date(Date.now() - minutesAgo * 60_000),
});

describe('priorityRank', () => {
  it('licensed always outranks unlicensed, whatever the seniority', () => {
    expect(priorityRank(user(true, null))).toBeGreaterThan(
      priorityRank(user(false, SeniorityTier.SEVEN_PLUS)),
    );
  });

  it('orders seniority brackets, with no tier lowest', () => {
    const ranks = [
      priorityRank(user(false, null)),
      priorityRank(user(false, SeniorityTier.ONE_TO_THREE)),
      priorityRank(user(false, SeniorityTier.THREE_TO_SEVEN)),
      priorityRank(user(false, SeniorityTier.SEVEN_PLUS)),
    ];
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(new Set(ranks).size).toBe(4);
  });
});

describe('pickNextWaitlisted', () => {
  it('returns null for an empty waitlist', () => {
    expect(pickNextWaitlisted([])).toBeNull();
  });

  it('picks the highest priority first', () => {
    const a = entry('a', user(false, SeniorityTier.SEVEN_PLUS), 60);
    const b = entry('b', user(true, null), 1);
    expect(pickNextWaitlisted([a, b])?.id).toBe('b');
  });

  it('within the same rank, the longest-waiting goes first', () => {
    const a = entry('a', user(false, null), 5);
    const b = entry('b', user(false, null), 50);
    expect(pickNextWaitlisted([a, b])?.id).toBe('b');
  });

  it('does not mutate its input', () => {
    const list = [
      entry('a', user(false, null), 1),
      entry('b', user(true, null), 2),
    ];
    pickNextWaitlisted(list);
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
