import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/lib/auth-store'
import { FootballSpinner } from '@/components/FootballSpinner'
import { login, fetchMe } from './api'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async (tokens) => {
      setTokens(tokens.accessToken, tokens.refreshToken)
      const me = await fetchMe()
      setUser(me)
      navigate('/')
    },
  })

  return (
    <div className="from-club-blue to-club-blue-dark relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br p-4">
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="bg-club-gold/20 pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full blur-3xl" />

      <Card className="animate-football-roll-in relative w-full max-w-sm border-white/20 shadow-2xl">
        <CardHeader className="items-center text-center">
          <div className="relative mb-2">
            <img src="/club-logo.png" alt="US Ronchin" className="h-20 w-20 drop-shadow" />
            <span className="animate-football-bounce absolute -top-1 -right-3 text-xl">⚽</span>
          </div>
          <CardTitle className="text-xl">US Ronchin</CardTitle>
          <CardDescription>Connecte-toi pour accéder à ton espace équipe.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {mutation.isError && (
              <p className="text-destructive text-sm">
                {isAxiosError(mutation.error) && mutation.error.response?.status === 403
                  ? (mutation.error.response.data as { message?: string })?.message
                  : 'Email ou mot de passe incorrect.'}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <FootballSpinner label="Connexion..." className="text-primary-foreground" />
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
