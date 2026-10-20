import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Routes, useLocation } from 'react-router'
import AdminPage from './pages/AdminPage'
import DailyPage from './pages/DailyPage'
import EditorPage from './pages/EditorPage'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import LegalPage from './pages/LegalPage'
import LobbyPage from './pages/LobbyPage'
import LyricsPage from './pages/LyricsPage'
import ProfilePage from './pages/ProfilePage'
import SignInPage from './pages/SignInPage'
import SoloPage, { SoloSingPage } from './pages/SoloPage'
import SongsPage from './pages/SongsPage'
import StagePage from './pages/StagePage'
import UploadPage from './pages/UploadPage'
import VerifyPage from './pages/VerifyPage'
import { AppShell } from './ui'

export default function App() {
  const { i18n } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  }, [i18n.resolvedLanguage])

  // The stage screen (a TV) is the whole window: no header, no page margins.
  if (location.pathname.startsWith('/stage/')) {
    return (
      <Routes>
        <Route path="/stage/:code" element={<StagePage />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/room/:code" element={<LobbyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/songs" element={<SongsPage />} />
        <Route path="/solo" element={<SoloPage />} />
        <Route path="/solo/:songId" element={<SoloSingPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/songs/upload" element={<UploadPage mode="upload" />} />
        <Route path="/songs/import" element={<UploadPage mode="import" />} />
        <Route path="/songs/:id/edit" element={<EditorPage />} />
        <Route path="/songs/:id/lyrics" element={<LyricsPage />} />
        <Route path="/terms" element={<LegalPage page="terms" />} />
        <Route path="/privacy" element={<LegalPage page="privacy" />} />
        <Route path="/credits" element={<LegalPage page="credits" />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </AppShell>
  )
}
