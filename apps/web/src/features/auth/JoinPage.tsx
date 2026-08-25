import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { join } from './api'

const PENDING_JOIN_EMAIL_KEY = 'pending-join-email'

export function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [isLicensed, setIsLicensed] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Already applied on this browser and still waiting — skip straight to the waiting
  // page instead of showing a blank signup form again.
  useEffect(() => {
    const pendingEmail = localStorage.getItem(PENDING_JOIN_EMAIL_KEY)
    if (pendingEmail) {
      navigate(`/join/waiting?email=${encodeURIComponent(pendingEmail)}&token=${token}`, {
        replace: true,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mutation = useMutation({
    mutationFn: () => join({ token, firstName, lastName, email, isLicensed, password }),
    onSuccess: () => {
      localStorage.setItem(PENDING_JOIN_EMAIL_KEY, email)
      navigate(`/join/waiting?email=${encodeURIComponent(email)}&token=${token}`)
    },
  })

  const passwordsMatch = password.length >= 8 && password === confirmPassword

  return (
    <div className="from-club-blue to-club-blue-dark relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br p-4">
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="bg-club-gold/20 pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full blur-3xl" />

      <Card className="animate-football-roll-in relative w-full max-w-sm border-white/20 shadow-2xl">
        <CardHeader className="items-center text-center">
          <img src="/club-logo.png" alt="US Ronchin" className="mb-2 h-20 w-20 drop-shadow" />
          <CardTitle>Rejoindre US Ronchin</CardTitle>
          <CardDescription>Crée ton compte joueur pour accéder à l'appli.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-destructive text-sm">Lien invalide.</p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (passwordsMatch) mutation.mutate()
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isLicensed"
                  checked={isLicensed}
                  onCheckedChange={(checked) => setIsLicensed(checked === true)}
                />
                <Label htmlFor="isLicensed">Joueur licencié FFF</Label>
              </div>
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
              {mutation.isError &&
                (isAxiosError(mutation.error) && mutation.error.response?.status === 409 ? (
                  <p className="text-destructive text-sm">
                    Un compte existe déjà avec cet email.{' '}
                    <Link to={`/login?email=${encodeURIComponent(email)}`} className="underline">
                      Se connecter
                    </Link>
                  </p>
                ) : (
                  <p className="text-destructive text-sm">
                    Impossible de créer le compte (lien invalide ou désactivé).
                  </p>
                ))}
              <Button type="submit" disabled={!passwordsMatch || mutation.isPending}>
                {mutation.isPending ? 'Création...' : 'Créer mon compte'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
