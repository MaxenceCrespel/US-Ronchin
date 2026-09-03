/** Interprets `date` ("YYYY-MM-DD") + `time` ("HH:mm" or "HH:mm:ss") as Europe/Paris
 * wall-clock time and returns the equivalent absolute instant — DST-aware (CET, UTC+1, in
 * winter; CEST, UTC+2, in summer).
 *
 * `new Date(`${date}T${time}`)` looks like it should just work, but the ECMAScript spec
 * treats a date-time string with no timezone designator as the *server's own* local time,
 * not the value's intended zone. Every deployment here runs in a plain Docker container with
 * no TZ set, i.e. UTC — so `new Date('2026-09-03T20:30:00')` silently means 20:30 UTC, which
 * is 22:30 in Paris during summer time. Every "N minutes before/after kickoff" scheduler
 * comparison built on that naive parse ends up comparing against a kickoff two hours later
 * than the real one (an hour in winter), which is exactly why team auto-generation and the
 * various reminders were firing at the wrong wall-clock time instead of near the real one. */
export function parisWallTimeToDate(date: string, time: string): Date {
  const naiveUtc = new Date(`${date}T${time}Z`);

  // What would this UTC instant display as if you read a Paris clock? The gap between that
  // and the naive value IS the Paris/UTC offset for this exact date (so DST just falls out
  // of the calculation instead of needing a lookup table).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(naiveUtc);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const asIfUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second')),
  );

  const offsetMs = naiveUtc.getTime() - asIfUtc;
  return new Date(naiveUtc.getTime() + offsetMs);
}

/** "Today" as a Paris calendar date ("YYYY-MM-DD") — `new Date().toISOString().slice(0, 10)`
 * is the UTC calendar date, which is the wrong side of midnight for roughly two hours a day
 * (22:00–00:00 Paris in summer, 23:00–00:00 in winter): a session scheduled for tonight would
 * be missed by a `WHERE date = today` query run in that window, since the UTC date has
 * already rolled over to tomorrow. */
export function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}
