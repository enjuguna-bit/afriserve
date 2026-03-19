import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppProviders } from './app/providers/AppProviders'
import { AuthSessionBootstrap } from './features/auth/components/AuthSessionBootstrap'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AuthSessionBootstrap>
        <App />
      </AuthSessionBootstrap>
    </AppProviders>
  </StrictMode>,
)
