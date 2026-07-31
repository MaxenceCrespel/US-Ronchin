import { cn } from '@/lib/utils'

export function FootballSpinner({
  label = 'Chargement...',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={cn('text-muted-foreground flex items-center justify-center gap-2 text-sm', className)}>
      <span className="animate-football-bounce">⚽</span>
      {label}
    </div>
  )
}
