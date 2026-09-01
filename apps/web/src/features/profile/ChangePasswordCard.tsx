import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { changePassword } from '@/features/auth/api'

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
  })

  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardContent className="pt-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (passwordsMatch) mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Mot de passe actuel</Label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Nouveau mot de passe (8 caractères min.)</Label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmNewPassword">Confirmer le nouveau mot de passe</Label>
            <PasswordInput
              id="confirmNewPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-destructive text-sm">Les mots de passe ne correspondent pas.</p>
          )}
          {mutation.isError && (
            <p className="text-destructive text-sm">
              {isAxiosError(mutation.error) && mutation.error.response?.status === 401
                ? 'Mot de passe actuel incorrect.'
                : "Impossible de changer le mot de passe."}
            </p>
          )}
          <Button type="submit" className="w-fit" disabled={!passwordsMatch || mutation.isPending}>
            {mutation.isPending ? 'Enregistrement...' : 'Changer le mot de passe'}
          </Button>
          {mutation.isSuccess && (
            <span className="text-muted-foreground text-sm">Mot de passe mis à jour.</span>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
