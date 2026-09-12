import { parisToday } from '../common/utils/paris-time';

/** "2026-09" for whatever calendar month `ref` falls in (Paris wall-clock date, "YYYY-MM-DD")
 * — defaults to today. Reused as the AwardCategory.season value for "Joueur du mois" rows,
 * the same way getCurrentSeasonLabel() is for the annual awards; the (key, season) unique
 * index doesn't care that one uses "2026-2027" and the other "2026-09", they just never
 * collide. */
export function monthLabel(ref: string = parisToday()): string {
  return ref.slice(0, 7);
}

/** "2026-08" for label "2026-09" — one calendar month back, wrapping the year at January. */
export function previousMonthLabel(label: string): string {
  const [year, month] = label.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** "septembre 2026" for label "2026-09" — the display form used everywhere this label
 * reaches a player (the vote card, the ceremony, the trophy gallery). */
export function monthLabelDisplay(label: string): string {
  const [year, month] = label.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2026-09-01"/"2026-09-30" for label "2026-09" — the calendar-day range a `date` column
 * needs to fall within to count as "in this month". */
export function monthBounds(label: string): { start: string; end: string } {
  const [year, month] = label.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${label}-01`, end: `${label}-${String(lastDay).padStart(2, '0')}` };
}
