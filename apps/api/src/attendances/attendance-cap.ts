import { Attendance } from './entities/attendance.entity';

/** Picks who gets promoted when a confirmed PRESENT slot frees up — licensed players ranked
 * ahead of non-licensed ones, then by respondedAt (longest-waiting first) within the same
 * license tier. Only ever decides who's NEXT in line for an open slot; it has no say over
 * anyone already confirmed (see AttendancesService.setAttendance, which keeps a slot with
 * whoever holds it — "premier arrivé, premier servi" once you're actually in). */
export function pickNextWaitlisted<T extends Pick<Attendance, 'respondedAt'> & { user: { isLicensed: boolean } }>(
  waitlisted: T[],
): T | null {
  if (waitlisted.length === 0) return null;
  return [...waitlisted].sort((a, b) => {
    if (a.user.isLicensed !== b.user.isLicensed) return a.user.isLicensed ? -1 : 1;
    return a.respondedAt.getTime() - b.respondedAt.getTime();
  })[0];
}
