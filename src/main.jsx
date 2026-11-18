import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import AuthGuard from './components/AuthGuard.jsx'
import SharedDeckPage from './components/SharedDeckPage.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import useTheme from './lib/useTheme.js'
import './index.css'

/**
 * The studio is its own chunk. A signed-out visitor — the landing page and the
 * sign-in form — never downloads the viewer, the editor, the agent or the
 * export pipeline, so the first thing they read arrives faster.
 */
const App = lazy(() => import('./App.jsx'))

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
          <Suspense
            fallback={
              <div className="route-loading">
                <div className="route-loading-spinner" aria-hidden />
                <div className="route-loading-text">Opening the studio…</div>
              </div>
            }
          >
            <App />
          </Suspense>
        </AuthGuard>
      </AuthProvider>
    )}
  </React.StrictMode>,
)
