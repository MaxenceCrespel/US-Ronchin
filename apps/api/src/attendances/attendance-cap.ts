import { Attendance } from './entities/attendance.entity';
import { SeniorityTier } from '../users/entities/user.entity';

const SENIORITY_RANK: Record<SeniorityTier, number> = {
  [SeniorityTier.SEVEN_PLUS]: 3,
  [SeniorityTier.THREE_TO_SEVEN]: 2,
  [SeniorityTier.ONE_TO_THREE]: 1,
};

/** Null (no tier set — "moins d'un an", a brand-new player) always ranks below every real
 * tier. Exported so evictLastNonLicensed (attendances.service.ts) ranks the same way when
 * bumping the other direction. */
export function seniorityRank(tier: SeniorityTier | null): number {
  return tier ? SENIORITY_RANK[tier] : 0;
}

/** Picks who gets promoted when a confirmed PRESENT slot frees up — three priority tiers,
 * highest first: licensed players, then by seniority bracket (a coach/admin-set field — the
 * club's real history, not account age: +7 ans > 3-7 ans > 1-3 ans > pas de palier), and by
 * respondedAt (longest-waiting first) within the same tier. Only ever decides who's NEXT in
 * line for an open slot; it has no say over anyone already confirmed (see
 * AttendancesService.setAttendance, which keeps a slot with whoever holds it — "premier
 * arrivé, premier servi" once you're actually in). */
export function pickNextWaitlisted<
  T extends Pick<Attendance, 'respondedAt'> & {
    user: { isLicensed: boolean; seniorityTier: SeniorityTier | null };
  },
>(waitlisted: T[]): T | null {
  if (waitlisted.length === 0) return null;
  return [...waitlisted].sort((a, b) => {
    if (a.user.isLicensed !== b.user.isLicensed) return a.user.isLicensed ? -1 : 1;
    const seniorityDiff = seniorityRank(b.user.seniorityTier) - seniorityRank(a.user.seniorityTier);
    if (seniorityDiff !== 0) return seniorityDiff;
    return a.respondedAt.getTime() - b.respondedAt.getTime();
  })[0];
}
