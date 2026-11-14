import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGuard from './components/AuthGuard.jsx'
import SharedDeckPage from './components/SharedDeckPage.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import useTheme from './lib/useTheme.js'
import './index.css'

// AuthGuard renders LoginPage instead of <App /> while signed out, so the
// theme hook never mounts and the login screen ignores stored/OS dark mode.
// Apply the resolved theme at the root, independent of auth state.
function ThemeBoot() {
  useTheme()
  return null
}

/**
 * `/share/{id}` is what the viewer's Share button produces: a deck link that
 * has to open for someone without an account, so it is routed before (and
 * outside) the auth guard.
 */
function sharedDeckIdFromLocation() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/share\/([^/?#]+)\/?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

const sharedDeckId = sharedDeckIdFromLocation()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeBoot />
    {sharedDeckId ? (
      <SharedDeckPage deckId={sharedDeckId} />
    ) : (
      <AuthProvider>
        <AuthGuard>
          <App />
        </AuthGuard>
      </AuthProvider>
    )}
  </React.StrictMode>,
)
