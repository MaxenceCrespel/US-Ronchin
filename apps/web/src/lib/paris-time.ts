/** Matches and trainings are stored as Paris wall-clock times ("2026-10-11" + "08:30"),
 * like the server (apps/api/src/common/utils/paris-time.ts). `new Date(`${date}T${time}`)`
 * reads such a string in the PHONE's timezone instead, so for anyone away from France every
 * "has it started / ended yet" check drifted by the time difference — in Egypt (one hour
 * ahead) an 08:30 kickoff counted as started at 07:30 Paris time and the end-of-match screen
 * showed before the match had even begun. This returns the real instant, DST-aware. */
export function parisWallTimeToDate(date: string, time: string | null | undefined): Date {
  const naiveUtc = new Date(`${date}T${time ?? '00:00'}Z`)
  const offsetMs = naiveUtc.getTime() - parisClockAsUtc(naiveUtc)
  return new Date(naiveUtc.getTime() + offsetMs)
}

/** What a Paris clock shows at `instant`, read back as if it were UTC. */
function parisClockAsUtc(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}
