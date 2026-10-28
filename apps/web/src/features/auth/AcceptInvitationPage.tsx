import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthBackdrop } from '@/components/AuthBackdrop'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { acceptInvitation, fetchMe } from './api'

export function AcceptInvitationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => acceptInvitation(token, password),
    onSuccess: async (tokens) => {
      setTokens(tokens.accessToken, tokens.refreshToken)
      const me = await fetchMe()
      setUser(me)
      navigate('/profile')
    },
  })

  const passwordsMatch = password.length >= 8 && password === confirmPassword

  return (
    <AuthBackdrop>

      <Card className="relative w-full max-w-sm border-0 shadow-2xl">
        <CardHeader className="items-center text-center">
          <img src="/club-logo.png" alt="US Ronchin" className="mb-2 h-20 w-20 drop-shadow" />
          <CardTitle>Bienvenue à Ronchin US</CardTitle>
          <CardDescription>Choisis ton mot de passe pour activer ton compte.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p role="alert" className="text-destructive text-sm">Lien d'invitation invalide.</p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (passwordsMatch) mutation.mutate()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Mot de passe (8 caractères min.)</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                  aria-describedby={confirmPassword.length > 0 && !passwordsMatch ? 'confirm-error' : undefined}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p id="confirm-error" role="alert" className="text-destructive text-sm">Les mots de passe ne correspondent pas.</p>
              )}
              {mutation.isError && (
                <p role="alert" className="text-destructive text-sm">
                  Impossible d'activer le compte (lien expiré ou déjà utilisé).
                </p>
              )}
              <Button type="submit" disabled={!passwordsMatch || mutation.isPending}>
                {mutation.isPending ? 'Activation...' : 'Activer mon compte'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthBackdrop>
  )
}
