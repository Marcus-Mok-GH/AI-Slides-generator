import { useCallback, useEffect, useState } from 'react'
import { fetchCurrentUser } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'

/**
 * Supabase-backed auth hook. The session lives in localStorage (managed by
 * supabase-js). On mount we check `getSession()` to see if the user is
 * already signed in, then subscribe to `onAuthStateChange` so the UI
 * reacts immediately to sign-in / sign-out events from the modal.
 *
 * Returned shape:
 *   - user: { id, email, firstName, lastName, profileImageUrl } | null
 *   - loading: true on first load only
 *   - isAuthenticated: boolean
 *   - openSignIn() / closeSignIn() / signInOpen — control the SignInModal
 *   - signOut(): clears the Supabase session and reloads
 */

export default function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
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
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'INITIAL_SESSION'
      ) {
        refresh()
      }
    })
    return () => sub?.subscription?.unsubscribe?.()
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

  const openSignIn = useCallback(() => setSignInOpen(true), [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      /* ignore */
    }
    setUser(null)
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
  }
}
