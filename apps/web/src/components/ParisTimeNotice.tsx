import { Clock } from 'lucide-react'
import { hoursAheadOfParis } from '@/lib/paris-time'

/** Every match and training time in the app is French time. For a player whose phone is on
 * another timezone (away abroad), say so once at the top, with the difference, so an
 * "08:30" isn't read as 08:30 on their own clock. Hidden in France. */
export function ParisTimeNotice() {
  const ahead = hoursAheadOfParis()
  if (ahead === 0) return null
  const diff = `${Math.abs(ahead)} h ${ahead > 0 ? "d'avance" : 'de retard'}`
  return (
    <div className="text-muted-foreground flex items-center gap-2 border-b px-4 py-1.5 text-xs">
      <Clock className="size-3.5 shrink-0" />
      Horaires à l'heure de France — ton téléphone a {diff}.
    </div>
  )
}
