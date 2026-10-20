import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Routes, useLocation } from 'react-router'
import Header from './components/Header'
import EditorPage from './pages/EditorPage'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import LobbyPage from './pages/LobbyPage'
import LyricsPage from './pages/LyricsPage'
import ProfilePage from './pages/ProfilePage'
import SignInPage from './pages/SignInPage'
import SongsPage from './pages/SongsPage'
import StagePage from './pages/StagePage'
import UploadPage from './pages/UploadPage'
import VerifyPage from './pages/VerifyPage'

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
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/auth/verify" element={<VerifyPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/room/:code" element={<LobbyPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/songs" element={<SongsPage />} />
          <Route path="/songs/upload" element={<UploadPage mode="upload" />} />
          <Route path="/songs/import" element={<UploadPage mode="import" />} />
          <Route path="/songs/:id/edit" element={<EditorPage />} />
          <Route path="/songs/:id/lyrics" element={<LyricsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </>
  )
}
