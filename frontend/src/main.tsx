import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { ConfirmProvider, ToastProvider } from './ui'
import '@fontsource-variable/figtree'
import '@fontsource-variable/unbounded'
import './i18n'
// The design system: tokens first, then shared pieces, then one file per area.
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/home.css'
import './styles/lobby.css'
import './styles/songs.css'
import './styles/editor.css'
import './styles/sing.css'
import './styles/spotlight.css'
import './styles/stage.css'
import './styles/solo.css'
import './styles/plans.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
