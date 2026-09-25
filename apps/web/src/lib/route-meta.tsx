import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

interface RouteMeta {
  pattern: RegExp
  title: string
  /** The page draws its own visible <h1> — otherwise a screen-reader-only one is added. */
  ownH1: boolean
}

const ROUTES: RouteMeta[] = [
  { pattern: /^\/login$/, title: 'Connexion', ownH1: false },
  { pattern: /^\/join$/, title: 'Créer mon compte', ownH1: false },
  { pattern: /^\/join\/waiting$/, title: 'Compte en attente de validation', ownH1: false },
  { pattern: /^\/accept-invitation$/, title: 'Activer mon compte', ownH1: false },
  { pattern: /^\/complete-profile$/, title: 'Compléter mon profil', ownH1: false },
  { pattern: /^\/fix-positions$/, title: 'Mes postes', ownH1: false },
  { pattern: /^\/$/, title: 'Accueil', ownH1: true },
  { pattern: /^\/trainings$/, title: 'Entraînements', ownH1: true },
  { pattern: /^\/matches$/, title: 'Matchs', ownH1: true },
  { pattern: /^\/matches\/[^/]+$/, title: 'Détail du match', ownH1: false },
  { pattern: /^\/stats$/, title: 'Stats', ownH1: true },
  { pattern: /^\/players$/, title: 'Effectif', ownH1: true },
  { pattern: /^\/player-ratings$/, title: 'Noter les joueurs', ownH1: true },
  { pattern: /^\/profile$/, title: 'Mon profil', ownH1: false },
  { pattern: /^\/profile\/edit$/, title: 'Modifier mon profil', ownH1: false },
  { pattern: /^\/profile\/badges$/, title: 'Mes badges', ownH1: false },
  { pattern: /^\/profile\/trophies$/, title: 'Mes trophées', ownH1: true },
  { pattern: /^\/profile\/notifications$/, title: 'Notifications', ownH1: false },
  { pattern: /^\/profile\/password$/, title: 'Mot de passe', ownH1: false },
  { pattern: /^\/profile\/club$/, title: 'Paramètres du club', ownH1: false },
  { pattern: /^\/admin\/import-pdf$/, title: 'Importer une feuille de match', ownH1: true },
  { pattern: /^\/admin$/, title: 'Administration', ownH1: true },
]

export function getRouteMeta(pathname: string): { title: string; ownH1: boolean } {
  const hit = ROUTES.find((r) => r.pattern.test(pathname))
  return hit ? { title: hit.title, ownH1: hit.ownH1 } : { title: 'Espace équipe', ownH1: true }
}

const SITE = 'US Ronchin'

/** Keeps the tab title in step with the page — the same title on every screen told screen
 * reader users (and anyone with several tabs) nothing about where they were. */
export function RouteTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = `${getRouteMeta(pathname).title} — ${SITE}`
  }, [pathname])
  return null
}

/** A visually-hidden <h1> for pages whose design has no visible one. */
export function SrHeading() {
  const { pathname } = useLocation()
  const { title, ownH1 } = getRouteMeta(pathname)
  return ownH1 ? null : <h1 className="sr-only">{title}</h1>
}

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="bg-background text-foreground focus:ring-ring sr-only z-[10000] rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
    >
      Aller au contenu
    </a>
  )
}

/** <main> landmark for the screens that live outside the signed-in layout (login, sign-up…). */
export function PublicShell() {
  return (
    <>
      <SkipLink />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <SrHeading />
        <Outlet />
      </main>
    </>
  )
}
