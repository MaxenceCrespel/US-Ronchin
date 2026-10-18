/** Red (0) to green (10) on a continuous hue scale — a half point still reads as "a bit
 * better/worse" rather than jumping between a handful of fixed buckets. Shared between the
 * coach's own rating slider and the post-match pitch view, so a given number always maps to
 * the same color everywhere it's shown. */
export function ratingColor(value: number): string {
  const hue = (value / 10) * 120
  return `hsl(${hue}deg 75% 42%)`
}

/** French comma-decimal display, "–" when there's nothing to show yet. */
export function ratingLabel(value: number | null): string {
  return value == null ? '–' : value.toFixed(1).replace('.', ',')
}
