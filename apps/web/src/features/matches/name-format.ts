/** Normalizes a name to "Word word" casing regardless of how it was typed (e.g. the
 * all-caps "CHOLOUX MEZRAG" family-style entry) — first letter of each space/hyphen-separated
 * part capitalized, the rest lowercased, so every player reads the same way everywhere. */
export function toDisplayCase(name: string): string {
  return name
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('')
}
