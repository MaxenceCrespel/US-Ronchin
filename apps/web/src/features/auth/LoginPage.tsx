import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { AuthBackdrop } from '@/components/AuthBackdrop'
import { useAuthStore } from '@/lib/auth-store'
import { FootballSpinner } from '@/components/FootballSpinner'
import { login, fetchMe } from './api'

const DARK_INPUT = 'h-12 rounded-xl border-white/25 bg-white/10 text-white placeholder:text-white/50'

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
    <AuthBackdrop>

      <div className="animate-football-roll-in flex w-full max-w-sm flex-col gap-7 text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/club-logo.png" alt="US Ronchin" className="size-24 drop-shadow" />
          <h1 className="font-display text-5xl leading-none font-extrabold uppercase italic">Espace équipe</h1>
          <p className="text-club-gold text-xs font-bold tracking-widest uppercase">US Ronchin · Depuis 1902</p>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-white/90">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="toi@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={DARK_INPUT}
            />
          </div>
          <div className="flex flex-col gap-1.5 [&_button]:text-white/80 [&_button:hover]:text-white">
            <Label htmlFor="password" className="text-white/90">
              Mot de passe
            </Label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={DARK_INPUT}
            />
          </div>
          {mutation.isError && (
            <p role="alert" className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-red-700">
              {isAxiosError(mutation.error) && mutation.error.response?.status === 403
                ? (mutation.error.response.data as { message?: string })?.message
                : 'Email ou mot de passe incorrect.'}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="bg-club-gold text-club-blue-dark hover:bg-club-gold/90 mt-1 w-full text-base font-extrabold"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <FootballSpinner label="Connexion..." className="text-club-blue-dark" /> : 'Se connecter'}
          </Button>
          <p className="text-center text-sm text-white/85">
            Nouveau dans l'équipe ?{' '}
            <Link to="/join" className="text-club-gold font-bold underline-offset-4 hover:underline">
              Créer mon compte
            </Link>
          </p>
        </form>
      </div>
    </AuthBackdrop>
  )
}
