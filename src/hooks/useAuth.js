import { useCallback, useEffect, useState } from 'react'
import { fetchCurrentUser } from '../lib/api.js'

/**
 * WorkOS-backed auth hook. The session lives in an HttpOnly cookie that the
 * server sets at /api/auth/callback, so the browser never sees the access
 * token. We just call /api/auth/user on mount to discover who's signed in.
 *
 * Returned shape:
 *   - user: { id, email, firstName, lastName, profileImageUrl } | null
 *   - loading: true on first load only
 *   - isAuthenticated: boolean
 *   - signIn(): redirects to /api/auth/login (top-level navigation)
 *   - signOut(): clears the WorkOS session and reloads
 */

function buildLoginUrl() {
  const returnTo =
    typeof window !== 'undefined' &&
    window.location.pathname + window.location.search
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`
}

export default function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Kept for SignInModal API compatibility — opening the modal just kicks
  // off the WorkOS redirect, but some screens still gate on `signInOpen`.
  const [signInOpen, setSignInOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const me = await fetchCurrentUser()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // If any API call returns 401 mid-session, clear local user state.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null)
    }
    window.addEventListener('slideai:unauthorized', onUnauthorized)
    return () =>
      window.removeEventListener('slideai:unauthorized', onUnauthorized)
  }, [])

  const openSignIn = useCallback(() => {
    setSignInOpen(true)
  }, [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      /* ignore */
    }
    setUser(null)
    // Hard navigate so any cached deck data drops with the session.
    if (typeof window !== 'undefined') {
      window.location.assign('/')
    }
  }, [])

  return {
    user,
    loading,
    isAuthenticated: !!user,
    signIn: openSignIn,
    openSignIn,
    closeSignIn,
    signInOpen,
    signOut,
    loginUrl: buildLoginUrl(),
  }
}
