import { SubPageHeader } from '@/components/SubPageHeader'
import { NotificationSettingsCard } from '@/features/push/NotificationSettingsCard'
import { NotificationPreferencesCard } from '@/features/push/NotificationPreferencesCard'

export function NotificationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Notifications" backTo="/profile" />
      <NotificationSettingsCard />
      <NotificationPreferencesCard />
    </div>
  )
}
