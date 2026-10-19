import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Routes } from 'react-router'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import JoinPage from './pages/JoinPage'
import LobbyPage from './pages/LobbyPage'
import ProfilePage from './pages/ProfilePage'
import SignInPage from './pages/SignInPage'
import VerifyPage from './pages/VerifyPage'

export default function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  }, [i18n.resolvedLanguage])

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
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </>
  )
}
