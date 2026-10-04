import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

interface RouteMeta {
  pattern: RegExp
  title: string
  /** The page draws its own visible <h1> — otherwise a screen-reader-only one is added. */
  ownH1: boolean
  /** Shown by the header's "?" button — what this specific screen does, not a full replay of
   * the welcome tour. Omitted for screens outside the signed-in app (login, sign-up…), which
   * don't have that button. */
  help?: string
}

const ROUTES: RouteMeta[] = [
  { pattern: /^\/login$/, title: 'Connexion', ownH1: false },
  { pattern: /^\/join$/, title: 'Créer mon compte', ownH1: false },
  { pattern: /^\/join\/waiting$/, title: 'Compte en attente de validation', ownH1: false },
  { pattern: /^\/accept-invitation$/, title: 'Activer mon compte', ownH1: false },
  { pattern: /^\/complete-profile$/, title: 'Compléter mon profil', ownH1: false },
  { pattern: /^\/fix-positions$/, title: 'Mes postes', ownH1: false },
  {
    pattern: /^\/$/,
    title: 'Accueil',
    ownH1: true,
    help: 'Le prochain rendez-vous de l’équipe, ce qu’il te reste à faire (noter un match, confirmer ta présence…) et les dernières actus du club.',
  },
  {
    pattern: /^\/trainings$/,
    title: 'Entraînements',
    ownH1: true,
    help: 'Le calendrier des séances. Clique un jour pour voir qui est présent, te déclarer, et (côté coach) composer les équipes.',
  },
  {
    pattern: /^\/matches$/,
    title: 'Matchs',
    ownH1: true,
    help: 'Le calendrier des matchs du mois — amical, coupe et championnat dans des couleurs différentes. Clique un match pour sa fiche complète.',
  },
  {
    pattern: /^\/matches\/[^/]+$/,
    title: 'Détail du match',
    ownH1: false,
    help: 'Convocation, composition, score et événements (buts, cartons) d’un match — tout ce qui le concerne est ici.',
  },
  {
    pattern: /^\/stats$/,
    title: 'Stats',
    ownH1: true,
    help: 'Quatre onglets : Mes stats (tes propres chiffres), Effectif (tout le monde), Bilan de saison (victoires/nuls/défaites, filtrable par compétition) et Équipe (défis du mois, classements).',
  },
  {
    pattern: /^\/championship$/,
    title: 'Championnat',
    ownH1: true,
    help: 'Le classement et les résultats de toute la poule, journée par journée — pas seulement nos matchs. Un sélecteur permet aussi de suivre une équipe en particulier sur toute la saison.',
  },
  {
    pattern: /^\/coupe$/,
    title: 'Coupe',
    ownH1: true,
    help: 'Notre parcours en coupe, tour par tour — il se complète au fil des tirages, jamais connu à l’avance.',
  },
  {
    pattern: /^\/players$/,
    title: 'Effectif',
    ownH1: true,
    help: 'Toute l’équipe — poste, licence, statut. Côté coach : inviter un joueur, valider un compte, modifier un profil.',
  },
  {
    pattern: /^\/player-ratings$/,
    title: 'Noter les joueurs',
    ownH1: true,
    help: 'Après chaque match, donne une note à tes coéquipiers — ça alimente leur moyenne dans les stats.',
  },
  { pattern: /^\/profile$/, title: 'Mon profil', ownH1: false, help: 'Tes infos, tes badges, tes trophées, tes notifications et ton mot de passe.' },
  { pattern: /^\/profile\/edit$/, title: 'Modifier mon profil', ownH1: false },
  {
    pattern: /^\/profile\/badges$/,
    title: 'Mes badges',
    ownH1: false,
    help: 'Ils se débloquent tout seuls selon ce que tu fais sur le terrain et à l’entraînement — certains sont bien cachés.',
  },
  { pattern: /^\/profile\/trophies$/, title: 'Mes trophées', ownH1: true, help: 'Les récompenses que tu as gagnées, saison par saison.' },
  { pattern: /^\/profile\/notifications$/, title: 'Notifications', ownH1: false },
  { pattern: /^\/profile\/password$/, title: 'Mot de passe', ownH1: false },
  {
    pattern: /^\/profile\/club$/,
    title: 'Paramètres du club',
    ownH1: false,
    help: 'Réglages réservés au coach : URLs FFF pour la synchro du calendrier, du championnat et de la coupe.',
  },
  {
    pattern: /^\/admin\/import-pdf$/,
    title: 'Importer une feuille de match',
    ownH1: true,
    help: 'Dépose la feuille de match officielle FFF (PDF) : composition, buts et cartons sont extraits automatiquement.',
  },
  { pattern: /^\/admin$/, title: 'Administration', ownH1: true, help: 'Indicateurs d’activité du club, réservés aux super-admins.' },
]

export function getRouteMeta(pathname: string): { title: string; ownH1: boolean } {
  const hit = ROUTES.find((r) => r.pattern.test(pathname))
  return hit ? { title: hit.title, ownH1: hit.ownH1 } : { title: 'Espace équipe', ownH1: true }
}

/** What the header's "?" button shows — the current screen's own description, not the full
 * welcome tour (that's one tap further, from inside the dialog this returns text for). */
export function getRouteHelp(pathname: string): { title: string; help: string } | null {
  const hit = ROUTES.find((r) => r.pattern.test(pathname))
  return hit?.help ? { title: hit.title, help: hit.help } : null
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
