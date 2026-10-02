import { cn } from '@/lib/utils'

/** Hides itself on a broken/missing src rather than showing a broken-image icon — a crest is
 * cosmetic, never worth a layout glitch over. Used anywhere a scraped district-site team
 * appears: standings, pool results, the cup bracket. */
export function TeamLogo({ src, className }: { src: string | null; className?: string }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className={cn('size-4 shrink-0 object-contain', className)}
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}
