/** Normalizes a name to "Word word" casing regardless of how it was typed (e.g. the
 * all-caps "CHOLOUX MEZRAG" family-style entry) — first letter of each space/hyphen-separated
 * part capitalized, the rest lowercased, so every player reads the same way everywhere. */
export function toDisplayCase(name: string): string {
  return name
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('')
}

/** Joins a guest's first and last name, dropping a missing/blank last name instead of
 * stringifying it as the literal text "null"/"undefined" (a guest entered with first name
 * only is common — a scorer added by name mid-match rarely gets their surname typed too). */
export function guestFullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter((part) => part && part.trim().length > 0).join(' ')
}
