import { useAuth } from '../context/AuthContext.jsx'
import LoginPage from './LoginPage.jsx'
import LandingPage from './LandingPage.jsx'
import SharedDeckPage from './SharedDeckPage.jsx'
import '../App.css'

/**
 * Deck id from an in-app deck URL. Share links made before /share existed
 * point at /app/slide/{id}, and those still need to open for guests.
 */
function deckIdFromLocation() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/app\/slide\/([^/?#]+)\/?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/**
 * Signed-out routing. `/` is the public landing page; URLs that only make
 * sense inside the product (`/login`, `/app/...`, `/agentfive`) go straight to
 * the sign-in form, so a deep link never lands on marketing copy.
 */
function wantsSignIn() {
  if (typeof window === 'undefined') return false
  return /^\/(login|signup|app|agentfive)(\/|$)/.test(window.location.pathname)
}

export default function AuthGuard({ children }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="route-loading">
        <div className="route-loading-spinner" aria-hidden />
        <div className="route-loading-text">Checking access…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // A deck link is not a reason to demand an account: show the read-only
    // deck and let the call to action do the asking.
    const deckId = deckIdFromLocation()
    if (deckId) return <SharedDeckPage deckId={deckId} />
    return wantsSignIn() ? <LoginPage /> : <LandingPage />
  }

  return children
}
