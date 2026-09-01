import { SubPageHeader } from '@/components/SubPageHeader'
import { ClubSettingsCard } from './ClubSettingsCard'

export function ClubSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Paramètres du club" backTo="/profile" />
      <ClubSettingsCard />
    </div>
  )
}
