import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <div className="from-club-blue to-club-blue-dark relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br p-4">
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="bg-club-gold/20 pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full blur-3xl" />

      <Card className="relative w-full max-w-sm border-white/20 shadow-2xl">
        <CardHeader className="items-center text-center">
          <img src="/club-logo.png" alt="US Ronchin" className="mb-2 h-20 w-20 drop-shadow" />
          <CardTitle>Bienvenue à Ronchin US</CardTitle>
          <CardDescription>Choisis ton mot de passe pour activer ton compte.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-destructive text-sm">Lien d'invitation invalide.</p>
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
    </div>
  )
}
