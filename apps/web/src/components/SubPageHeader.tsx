import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Header for a page reached by tapping a block on a "menu" page (e.g. from /profile) —
 * a back chevron to the parent plus a title, so drilling into a section never strands the
 * user without a way back. */
export function SubPageHeader({ title, backTo }: { title: string; backTo: string }) {
  return (
    <div className="mb-2 flex items-center gap-1">
      <Link
        to={backTo}
        aria-label="Retour"
        className="text-muted-foreground hover:text-foreground hover:bg-accent -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <ChevronLeft className="size-5" />
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  )
}
