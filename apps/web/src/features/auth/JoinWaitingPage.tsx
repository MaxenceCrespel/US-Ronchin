import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FootballSpinner } from '@/components/FootballSpinner'
import { fetchJoinStatus } from './api'

const POLL_INTERVAL_MS = 5000
const PENDING_JOIN_EMAIL_KEY = 'pending-join-email'

export function JoinWaitingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const email = searchParams.get('email') ?? ''
  const token = searchParams.get('token') ?? ''

  const statusQuery = useQuery({
    queryKey: ['join-status', email],
    queryFn: () => fetchJoinStatus(email),
    enabled: !!email,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const status = statusQuery.data?.status

  useEffect(() => {
    // Terminal states — the "already applied on this browser" redirect in JoinPage
    // shouldn't fire anymore once approved or gone.
    if (status === 'ACTIVE' || status === 'NOT_FOUND') {
      localStorage.removeItem(PENDING_JOIN_EMAIL_KEY)
    }
  }, [status])

  return (
    <div className="from-club-blue to-club-blue-dark relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br p-4">
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="bg-club-gold/20 pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full blur-3xl" />

      <Card className="animate-football-roll-in relative w-full max-w-sm border-white/20 shadow-2xl">
        <CardHeader className="items-center text-center">
          <img src="/club-logo.png" alt="US Ronchin" className="mb-2 h-20 w-20 drop-shadow" />
          <CardTitle>Rejoindre US Ronchin</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          {!email ? (
            <p className="text-destructive text-center text-sm">Lien invalide.</p>
          ) : status === 'ACTIVE' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-10 text-emerald-600" />
              <p className="font-medium">Ton compte a été validé 🎉</p>
              <p className="text-muted-foreground text-sm">
                Tu peux maintenant te connecter.
              </p>
              <Button onClick={() => navigate(`/login?email=${encodeURIComponent(email)}`)}>
                Se connecter
              </Button>
            </div>
          ) : status === 'NOT_FOUND' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="font-medium">Demande introuvable</p>
              <p className="text-muted-foreground text-sm">
                Ta demande a peut-être été refusée ou supprimée par le coach.
              </p>
              {token && (
                <Button variant="outline" onClick={() => navigate(`/join?token=${token}`)}>
                  Refaire une demande
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {statusQuery.isLoading ? (
                <FootballSpinner label="Vérification..." />
              ) : (
                <>
                  <Clock className="text-muted-foreground size-10" />
                  <p className="font-medium">En attente de validation par le coach</p>
                  <p className="text-muted-foreground text-sm">
                    Cette page se met à jour automatiquement — pas besoin de revenir la vérifier
                    manuellement.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
