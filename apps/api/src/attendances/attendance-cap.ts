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

/** A guest ("+1", someone brought along with no account of their own) ranks BELOW every
 * player with an account — including a player with no licence and no seniority at all, who
 * is priorityRank 0. A guest never inherits the rank of whoever brought them: the licence or
 * seniority of the inviter says nothing about the guest, and an app player always outranks
 * one. Used to pick which confirmed guest gives up a place when a player arrives into a full
 * session (before any player is even considered for eviction — see
 * AttendancesService.evictGuest), and to keep guests from being promoted ahead of a
 * waitlisted player (see AttendancesService.promoteWaitlist). Every guest shares this same
 * rank, so among them it's "last declared, first out". */
export function pickRowToLoseAGuest<T extends Pick<Attendance, 'confirmedGuestCount' | 'respondedAt'>>(
  rows: T[],
): T | null {
  const holdingGuests = rows.filter((a) => a.confirmedGuestCount > 0);
  if (holdingGuests.length === 0) return null;
  return [...holdingGuests].sort((a, b) => b.respondedAt.getTime() - a.respondedAt.getTime())[0];
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
