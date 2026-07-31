import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { join } from './api'

export function JoinPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [isLicensed, setIsLicensed] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => join({ token, firstName, lastName, email, isLicensed, password }),
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
          ) : mutation.isSuccess ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="size-10 text-emerald-600" />
              <p className="font-medium">Compte créé !</p>
              <p className="text-muted-foreground text-sm">
                Le coach doit valider ton compte avant que tu puisses te connecter.
              </p>
            </div>
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
              {mutation.isError && (
                <p className="text-destructive text-sm">
                  Impossible de créer le compte (lien invalide/désactivé ou email déjà utilisé).
                </p>
              )}
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
