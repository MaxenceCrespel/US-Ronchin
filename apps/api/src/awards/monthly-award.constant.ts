/** The fixed categories that recur every month — same AwardCategory/AwardVote tables as the
 * season awards, just scoped to a "YYYY-MM" month instead of a "YYYY-YYYY" season (see
 * month.util.ts). One row per key per month, created idempotently by MonthlyAwardScheduler,
 * all opened and closed together the same way the season's five categories are.
 *
 * "Homme du match" and "Patron de la défense" deliberately do NOT live here — they're voted
 * per MATCH (see matches.service.ts's getMotm/getDefenseBoss and MatchMotmVote/
 * MatchDefenseBossVote), not as a monthly roster-wide re-vote on top of that. This list stays
 * a single-entry array (rather than a plain string) so findMonthly/the scheduler/the frontend
 * don't need reverting if a genuinely new monthly category shows up later. */
export const FIXED_MONTHLY_AWARD_CATEGORIES: { key: string; title: string }[] = [
  { key: 'player_of_month', title: 'Joueur du mois' },
];

export const MONTHLY_AWARD_KEYS = FIXED_MONTHLY_AWARD_CATEGORIES.map((c) => c.key);
