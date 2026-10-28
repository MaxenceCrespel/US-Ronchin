import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SUB_POSITION_ABBR, SUB_POSITION_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { PlayerSubPosition } from '@/lib/types'

export const MAX_POSITIONS = 3

const NONE = '__none__'

const SLOT_LABELS = ['Poste principal', 'Poste secondaire', 'Poste tertiaire'] as const

/** Where each position sits on a vertical pitch (attack at the top), in % of its box. */
const PITCH_SPOTS: Record<PlayerSubPosition, [x: number, y: number]> = {
  STRIKER: [50, 10],
  LEFT_WINGER: [15, 19],
  RIGHT_WINGER: [85, 19],
  ATTACKING_MIDFIELDER: [50, 31],
  LEFT_MIDFIELDER: [15, 45],
  CENTER_MIDFIELDER: [50, 47],
  RIGHT_MIDFIELDER: [85, 45],
  DEFENSIVE_MIDFIELDER: [50, 61],
  LEFT_BACK: [15, 73],
  CENTER_BACK: [50, 76],
  RIGHT_BACK: [85, 73],
  GOALKEEPER: [50, 91],
}

/** Tap-to-pick pitch: the first position touched is the main one, then second, then third;
 * touching a picked one removes it. The slot menus below stay for fine-tuning the order. */
function PitchPicker({
  value,
  onChange,
}: {
  value: PlayerSubPosition[]
  onChange: (next: PlayerSubPosition[]) => void
}) {
  const toggle = (position: PlayerSubPosition) => {
    if (value.includes(position)) onChange(value.filter((p) => p !== position))
    else if (value.length < MAX_POSITIONS) onChange([...value, position])
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        Touche les postes où tu joues <span className="text-muted-foreground font-normal">(le premier = principal, 3 max)</span>
      </p>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-[#0f5e3a]">
        <svg
          aria-hidden="true"
          viewBox="0 0 300 400"
          className="absolute inset-0 size-full"
          fill="none"
          stroke="rgb(255 255 255 / 0.35)"
          strokeWidth="2"
        >
          <rect x="10" y="10" width="280" height="380" rx="4" />
          <line x1="10" y1="200" x2="290" y2="200" />
          <circle cx="150" cy="200" r="36" />
          <rect x="85" y="10" width="130" height="50" />
          <rect x="85" y="340" width="130" height="50" />
        </svg>
        {(Object.keys(PITCH_SPOTS) as PlayerSubPosition[]).map((position) => {
          const [x, y] = PITCH_SPOTS[position]
          const rank = value.indexOf(position)
          const full = rank < 0 && value.length >= MAX_POSITIONS
          return (
            <button
              key={position}
              type="button"
              aria-pressed={rank >= 0}
              aria-label={`${SUB_POSITION_LABELS[position]}${rank >= 0 ? `, choix ${rank + 1}` : ''}`}
              disabled={full}
              onClick={() => toggle(position)}
              className={cn(
                'font-display absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-40',
                rank === 0
                  ? 'bg-club-gold text-club-blue-dark shadow-[0_0_0_4px_rgb(244_180_0_/_0.35)]'
                  : rank > 0
                    ? 'text-club-blue-dark bg-white'
                    : 'border-[1.5px] border-white/70 bg-black/25 text-white',
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {SUB_POSITION_ABBR[position]}
              {rank >= 0 && (
                <span className="bg-club-blue-dark absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[11px] text-white">
                  {rank + 1}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Ordered 1st/2nd/3rd position picker — replaces the old free checkbox grid. Order now
 * carries meaning (slot 0 = primary, etc.), and structurally caps at MAX_POSITIONS since
 * there are only that many slots — see UpdateProfileDto's matching @ArrayMaxSize(3). A
 * secondary/tertiary slot only offers positions not already picked in an earlier slot, and
 * the tertiary slot stays disabled until a secondary one is chosen. */
export function PositionPicker({
  value,
  onChange,
}: {
  value: PlayerSubPosition[]
  onChange: (next: PlayerSubPosition[]) => void
}) {
  const slots: (PlayerSubPosition | '')[] = [value[0] ?? '', value[1] ?? '', value[2] ?? '']

  const setSlot = (index: number, position: PlayerSubPosition | '') => {
    const next = [...slots]
    next[index] = position
    // Clearing an earlier slot clears everything after it — a tertiary position with no
    // secondary makes no sense, and re-numbering silently would be more confusing than
    // just asking again.
    if (!position) {
      for (let i = index + 1; i < next.length; i++) next[i] = ''
    }
    onChange(next.filter((p): p is PlayerSubPosition => !!p))
  }

  return (
    <div className="flex flex-col gap-3">
      <PitchPicker value={value} onChange={onChange} />
      {SLOT_LABELS.map((label, index) => {
        const taken = new Set(slots.filter((_, i) => i !== index && slots[i]))
        const disabled = index > 0 && !slots[index - 1]
        return (
          <div key={label} className="flex flex-col gap-1.5">
            <Label>
              {label}
              {index === 0 ? '' : ' (optionnel)'}
            </Label>
            <Select
              value={slots[index] || (disabled ? undefined : NONE)}
              onValueChange={(v) => setSlot(index, v === NONE ? '' : (v as PlayerSubPosition))}
              disabled={disabled}
            >
              <SelectTrigger aria-label={label} className="w-full">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {index > 0 && <SelectItem value={NONE}>Aucun</SelectItem>}
                {Object.entries(SUB_POSITION_LABELS)
                  .filter(([v]) => !taken.has(v as PlayerSubPosition))
                  .map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
