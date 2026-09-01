import { SubPageHeader } from '@/components/SubPageHeader'
import { NotificationSettingsCard } from '@/features/push/NotificationSettingsCard'

export function NotificationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Notifications" backTo="/profile" />
      <NotificationSettingsCard />
    </div>
  )
}
