import { SubPageHeader } from '@/components/SubPageHeader'
import { useAuthStore } from '@/lib/auth-store'
import { BadgesGrid } from '@/features/badges/BadgesGrid'

export function BadgesPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Badges" backTo="/profile" />
      <BadgesGrid userId={user.id} />
    </div>
  )
}
