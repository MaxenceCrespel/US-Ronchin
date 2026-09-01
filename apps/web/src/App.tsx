import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/app/Layout'
import { RequireAuth } from '@/app/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { AcceptInvitationPage } from '@/features/auth/AcceptInvitationPage'
import { JoinPage } from '@/features/auth/JoinPage'
import { JoinWaitingPage } from '@/features/auth/JoinWaitingPage'
import { HomePage } from '@/features/home/HomePage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { EditProfilePage } from '@/features/profile/EditProfilePage'
import { BadgesPage } from '@/features/profile/BadgesPage'
import { NotificationsPage } from '@/features/profile/NotificationsPage'
import { PasswordPage } from '@/features/profile/PasswordPage'
import { ClubSettingsPage } from '@/features/profile/ClubSettingsPage'
import { CompleteProfilePage } from '@/features/profile/CompleteProfilePage'
import { FixPositionsPage } from '@/features/profile/FixPositionsPage'
import { AdminKpisPage } from '@/features/admin/AdminKpisPage'
import { TrainingsPage } from '@/features/trainings/TrainingsPage'
import { PlayersPage } from '@/features/players/PlayersPage'
import { MatchesPage } from '@/features/matches/MatchesPage'
import { MatchDetailPage } from '@/features/matches/MatchDetailPage'
import { StatsPage } from '@/features/stats/StatsPage'
import { ImportMatchPdfPage } from '@/features/pdf-import/ImportMatchPdfPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/join/waiting" element={<JoinWaitingPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/complete-profile" element={<CompleteProfilePage />} />
        <Route path="/fix-positions" element={<FixPositionsPage />} />
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
  )
}

export default App
