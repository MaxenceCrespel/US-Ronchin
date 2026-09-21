import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SUB_POSITION_ABBR, SUB_POSITION_LABELS } from '@/lib/labels'
import type { PlayerSubPosition } from '@/lib/types'

const POSITIONS = Object.keys(SUB_POSITION_ABBR) as PlayerSubPosition[]

/** What GB, DC, MDF, BU… stand for — the codes are everywhere (lineups, convocation, squad)
 * and nothing spelled them out for a newcomer. */
export function PositionLegend() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 self-start px-2 text-xs">
          <CircleHelp className="size-3.5" aria-hidden="true" />
          Légende des postes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Légende des postes</DialogTitle>
          <DialogDescription>Les abréviations utilisées dans les compositions et l'effectif.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {POSITIONS.map((position) => (
            <div key={position} className="contents">
              <dt className="font-semibold tabular-nums">{SUB_POSITION_ABBR[position]}</dt>
              <dd className="text-muted-foreground">{SUB_POSITION_LABELS[position]}</dd>
            </div>
          ))}
        </dl>
        <dl className="border-t pt-3 text-sm">
          <div className="flex gap-2">
            <dt className="font-semibold">Rempl.</dt>
            <dd className="text-muted-foreground">remplaçant, sur le banc</dd>
          </div>
          <div className="mt-1 flex gap-2">
            <dt className="font-semibold">Spect.</dt>
            <dd className="text-muted-foreground">spectateur : présent au match sans jouer</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  )
}
