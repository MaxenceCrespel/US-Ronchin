import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FormationPlayer {
  userId: string
  firstName: string
  lastName: string
  shirtNumber: number | null
  x: number
  y: number
}

/** Same bands used server-side to derive a position category from a slot's y coordinate. */
export function bandForY(y: number): 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD' {
  if (y >= 85) return 'GOALKEEPER'
  if (y >= 65) return 'DEFENDER'
  if (y >= 28) return 'MIDFIELDER'
  return 'FORWARD'
}

const BAND_COLOR: Record<ReturnType<typeof bandForY>, string> = {
  GOALKEEPER: 'bg-amber-400 border-amber-600',
  DEFENDER: 'bg-club-blue border-club-blue-dark',
  MIDFIELDER: 'bg-emerald-500 border-emerald-700',
  FORWARD: 'bg-rose-500 border-rose-700',
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Fixed formation slots — dragging a player onto another swaps their slots, it never places
 * them at an arbitrary spot. */
export function PitchFormationEditor({
  players,
  onSwap,
  readOnly,
}: {
  players: FormationPlayer[]
  onSwap: (draggedUserId: string, targetUserId: string) => void
  readOnly?: boolean
}) {
  const [drag, setDrag] = useState<{ userId: string; x: number; y: number } | null>(null)

  function updateFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setDrag((prev) => (prev ? { ...prev, x, y } : prev))
  }

  function endDrag() {
    if (!drag) return
    const target = players
      .filter((p) => p.userId !== drag.userId)
      .map((p) => ({ p, d: distance(p, drag) }))
      .sort((a, b) => a.d - b.d)[0]
    if (target && target.d < 18) {
      onSwap(drag.userId, target.p.userId)
    }
    setDrag(null)
  }

  return (
    <div
      className="relative mx-auto aspect-[3/4] w-full max-w-sm touch-none overflow-hidden rounded-xl border-2 border-white/50 bg-gradient-to-b from-emerald-600 to-emerald-700 select-none"
      onPointerMove={updateFromPointer}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/40" />
      <div className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
      <div className="absolute inset-x-[22%] top-0 h-[12%] border-x border-b border-white/40" />
      <div className="absolute inset-x-[22%] bottom-0 h-[12%] border-x border-t border-white/40" />

      {players.map((p) => {
        const isDragging = drag?.userId === p.userId
        const pos = isDragging ? drag : p
        const band = bandForY(p.y)
        return (
          <div
            key={p.userId}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            className={cn(
              'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5',
              isDragging ? 'z-10 transition-none' : 'transition-[left,top] duration-200',
            )}
          >
            <button
              type="button"
              disabled={readOnly}
              onPointerDown={(e) => {
                if (readOnly) return
                e.currentTarget.setPointerCapture(e.pointerId)
                setDrag({ userId: p.userId, x: p.x, y: p.y })
              }}
              title={`${p.firstName} ${p.lastName}`}
              className={cn(
                'flex size-9 items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow-md',
                !readOnly && 'cursor-grab active:cursor-grabbing',
                isDragging && 'scale-110',
                BAND_COLOR[band],
              )}
            >
              {p.shirtNumber ?? `${p.firstName[0]}${p.lastName[0]}`}
            </button>
            <span className="pointer-events-none max-w-16 truncate rounded bg-black/40 px-1 text-[9px] font-medium text-white">
              {p.firstName}
            </span>
          </div>
        )
      })}
    </div>
  )
}
