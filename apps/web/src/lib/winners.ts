/** A closed vote's `results` is every player who got at least one vote, sorted by votes — only
 * the ones tied at the top actually won. A tie at the top means co-winners, everywhere a
 * winner is shown or a trophy handed out (reveal, home card, ceremony, trophy case). */
export function topVoted<T extends { votes: number }>(results: T[] | null | undefined): T[] {
  const top = results?.[0]?.votes ?? 0
  return top > 0 ? results!.filter((r) => r.votes === top) : []
}

export function isTopVoted(results: { userId: string; votes: number }[] | null | undefined, userId?: string): boolean {
  return !!userId && topVoted(results).some((r) => r.userId === userId)
}

/** "A", "A et B", "A, B et C" — every co-winner is named, however many tied. */
export function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}
