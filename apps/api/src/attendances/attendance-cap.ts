import { Attendance } from './entities/attendance.entity';
import { SeniorityTier } from '../users/entities/user.entity';

const SENIORITY_RANK: Record<SeniorityTier, number> = {
  [SeniorityTier.SEVEN_PLUS]: 3,
  [SeniorityTier.THREE_TO_SEVEN]: 2,
  [SeniorityTier.ONE_TO_THREE]: 1,
};

type PriorityUser = { isLicensed: boolean; seniorityTier: SeniorityTier | null };

/** A single number capturing the full 3-tier priority: licensed always outranks every
 * non-licensed player regardless of seniority (0-3 for seniority, offset by 4 once
 * licensed, so the ranges never overlap), and within "not licensed" a higher seniority
 * bracket outranks a lower one — null (no tier, "moins d'un an") ranks lowest of all.
 * Used both to order the waitlist (pickNextWaitlisted) and to decide whether an arriving
 * player outranks someone already confirmed (AttendancesService.evictLowerPriority). */
export function priorityRank(user: PriorityUser): number {
  const seniority = user.seniorityTier ? SENIORITY_RANK[user.seniorityTier] : 0;
  return user.isLicensed ? seniority + 4 : seniority;
}

/** Picks who gets promoted when a confirmed PRESENT slot frees up — highest priorityRank
 * first, then by respondedAt (longest-waiting first) within the same rank. Only ever
 * decides who's NEXT in line for an open slot; it has no say over anyone already confirmed
 * (see AttendancesService.setAttendance, which keeps a slot with whoever holds it —
 * "premier arrivé, premier servi" once you're actually in — unless a later arrival
 * outranks them, see evictLowerPriority). */
export function pickNextWaitlisted<T extends Pick<Attendance, 'respondedAt'> & { user: PriorityUser }>(
  waitlisted: T[],
): T | null {
  if (waitlisted.length === 0) return null;
  return [...waitlisted].sort((a, b) => {
    const rankDiff = priorityRank(b.user) - priorityRank(a.user);
    if (rankDiff !== 0) return rankDiff;
    return a.respondedAt.getTime() - b.respondedAt.getTime();
  })[0];
}
