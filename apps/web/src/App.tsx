import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PublicShell, RouteTitle } from '@/lib/route-meta'
import { Layout } from '@/app/Layout'
import { RequireAuth } from '@/app/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { AcceptInvitationPage } from '@/features/auth/AcceptInvitationPage'
import { JoinPage } from '@/features/auth/JoinPage'
import { JoinWaitingPage } from '@/features/auth/JoinWaitingPage'
import { HomePage } from '@/features/home/HomePage'

// Every screen after login/home is fetched on demand: the first load only needs the entry
// screens, not the trainings, stats, admin and PDF-import code.
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const EditProfilePage = lazy(() => import('@/features/profile/EditProfilePage').then((m) => ({ default: m.EditProfilePage })))
const BadgesPage = lazy(() => import('@/features/profile/BadgesPage').then((m) => ({ default: m.BadgesPage })))
const NotificationsPage = lazy(() => import('@/features/profile/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const PasswordPage = lazy(() => import('@/features/profile/PasswordPage').then((m) => ({ default: m.PasswordPage })))
const ClubSettingsPage = lazy(() => import('@/features/profile/ClubSettingsPage').then((m) => ({ default: m.ClubSettingsPage })))
const CompleteProfilePage = lazy(() => import('@/features/profile/CompleteProfilePage').then((m) => ({ default: m.CompleteProfilePage })))
const FixPositionsPage = lazy(() => import('@/features/profile/FixPositionsPage').then((m) => ({ default: m.FixPositionsPage })))
const AdminKpisPage = lazy(() => import('@/features/admin/AdminKpisPage').then((m) => ({ default: m.AdminKpisPage })))
const TrainingsPage = lazy(() => import('@/features/trainings/TrainingsPage').then((m) => ({ default: m.TrainingsPage })))
const PlayersPage = lazy(() => import('@/features/players/PlayersPage').then((m) => ({ default: m.PlayersPage })))
const MatchesPage = lazy(() => import('@/features/matches/MatchesPage').then((m) => ({ default: m.MatchesPage })))
const MatchDetailPage = lazy(() => import('@/features/matches/MatchDetailPage').then((m) => ({ default: m.MatchDetailPage })))
const StatsPage = lazy(() => import('@/features/stats/StatsPage').then((m) => ({ default: m.StatsPage })))
const TrophyCasePage = lazy(() => import('@/features/awards/TrophyCasePage').then((m) => ({ default: m.TrophyCasePage })))
const ImportMatchPdfPage = lazy(() => import('@/features/pdf-import/ImportMatchPdfPage').then((m) => ({ default: m.ImportMatchPdfPage })))

function PageFallback() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status">
      <span className="sr-only">Chargement…</span>
      <div className="border-club-blue size-8 animate-spin rounded-full border-4 border-t-transparent" aria-hidden="true" />
    </div>
  )
}

function App() {
  return (
    <>
      <RouteTitle />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<PublicShell />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/join/waiting" element={<JoinWaitingPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<PublicShell />}>
              <Route path="/complete-profile" element={<CompleteProfilePage />} />
              <Route path="/fix-positions" element={<FixPositionsPage />} />
            </Route>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/trainings" element={<TrainingsPage />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/matches/:id" element={<MatchDetailPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/edit" element={<EditProfilePage />} />
              <Route path="/profile/badges" element={<BadgesPage />} />
              <Route path="/profile/trophies" element={<TrophyCasePage />} />
              <Route path="/profile/notifications" element={<NotificationsPage />} />
              <Route path="/profile/password" element={<PasswordPage />} />

              <Route element={<RequireAuth roles={['COACH']} />}>
                <Route path="/admin/import-pdf" element={<ImportMatchPdfPage />} />
                <Route path="/profile/club" element={<ClubSettingsPage />} />
              </Route>

              <Route element={<RequireAuth roles={['SUPERADMIN']} />}>
                <Route path="/admin" element={<AdminKpisPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
