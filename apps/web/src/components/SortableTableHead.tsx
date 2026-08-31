import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** A clickable <TableHead> that shows the current sort direction — click again to flip it,
 * click a different column to switch. Generic over the sort key so any stats table can reuse
 * it (first used in StatsPage's roster table, now also the per-match recap in
 * MatchDetailPage). */
export function SortableTableHead<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'right',
  stickyLeft = false,
}: {
  label: string
  sortKey: K
  activeKey: K
  dir: 'asc' | 'desc'
  onSort: (key: K) => void
  align?: 'left' | 'right'
  stickyLeft?: boolean
}) {
  const active = sortKey === activeKey
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', stickyLeft && 'bg-card sticky left-0 z-10')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'hover:text-foreground inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground font-semibold',
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  )
}
