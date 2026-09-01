import { SubPageHeader } from '@/components/SubPageHeader'
import { ChangePasswordCard } from './ChangePasswordCard'

export function PasswordPage() {
  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title="Mot de passe" backTo="/profile" />
      <ChangePasswordCard />
    </div>
  )
}
