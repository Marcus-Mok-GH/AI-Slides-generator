import { useCallback, useEffect, useState } from 'react'
import { fetchCurrentUser } from '../lib/api.js'

/**
 * Lightweight auth hook. No React Query in this codebase, so we just keep
 * `{ user, loading, error }` in local state and listen for `slideai:unauthorized`
 * events fired by the API layer to re-check the session in case the cookie
 * expired mid-session.
 *
 * Returned shape:
 *   - user: { id, email, firstName, lastName, profileImageUrl } | null
 *   - loading: true on first load only
 *   - isAuthenticated: boolean
 *   - refresh(): force a re-check
 *   - signIn(): redirects to /api/login
 *   - signOut(): redirects to /api/logout
 */
export default function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const u = await fetchCurrentUser()
      setUser(u)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // If any API call returns 401, drop the user so the app re-renders the
  // landing page. Without this, expired sessions silently break deck loads.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null)
    }
    window.addEventListener('slideai:unauthorized', onUnauthorized)
    return () =>
      window.removeEventListener('slideai:unauthorized', onUnauthorized)
  }, [])

  const signIn = useCallback(() => {
    // Preserve the current URL so we land back on the deck after login.
    // We use localStorage (not sessionStorage) because some auth flows
    // navigate the top window away — sessionStorage doesn't survive that.
    const returnTo = window.location.pathname + window.location.search
    if (returnTo && returnTo !== '/') {
      try {
        localStorage.setItem('slideai:returnTo', returnTo)
      } catch {
        /* ignore quota errors */
      }
    }
    window.location.href = '/api/login'
  }, [])

  const signOut = useCallback(() => {
    window.location.href = '/api/logout'
  }, [])

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    refresh,
    signIn,
    signOut,
  }
}
