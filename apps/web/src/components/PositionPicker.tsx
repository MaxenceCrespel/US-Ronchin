import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SUB_POSITION_LABELS } from '@/lib/labels'
import type { PlayerSubPosition } from '@/lib/types'

export const MAX_POSITIONS = 3

const NONE = '__none__'

const SLOT_LABELS = ['Poste principal', 'Poste secondaire', 'Poste tertiaire'] as const

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
              <SelectTrigger className="w-full">
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
