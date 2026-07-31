import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
}

const SIZE_CLASSES = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-24 text-2xl',
}

export function PlayerAvatar({
  avatarUrl,
  firstName,
  lastName,
  size = 'md',
  className,
}: {
  avatarUrl?: string | null
  firstName?: string
  lastName?: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  return (
    <Avatar className={cn(SIZE_CLASSES[size], 'border-club-blue/20 border', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={`${firstName ?? ''} ${lastName ?? ''}`} />}
      <AvatarFallback className="bg-club-blue text-white">
        {initials(firstName, lastName)}
      </AvatarFallback>
    </Avatar>
  )
}
