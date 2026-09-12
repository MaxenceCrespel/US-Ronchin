/** "septembre 2026" for a "YYYY-MM" AwardCategory.season value — the display form used
 * everywhere a monthly award's period reaches the UI (vote card, ceremony, trophy gallery).
 * Mirror of the API's month.util.ts monthLabelDisplay(), kept separate since the two never
 * share a module. */
export function monthLabelDisplay(label: string): string {
  const [year, month] = label.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
