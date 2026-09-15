import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** French plural of a stat unit — a word ending in s/x/z ("fois") never takes an extra "s". */
export function pluralize(word: string, count: number): string {
  if (count <= 1 || /[sxz]$/i.test(word)) return word
  return `${word}s`
}
