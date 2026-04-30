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
  const [passwordResetOpen, setPasswordResetOpen] = useState(false)

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
      // PASSWORD_RECOVERY fires when Supabase processes the reset token from
      // the email link.  We open the reset modal so the user can set a new
      // password even if they navigated away from the redirect page.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordResetOpen(true)
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

  // The proxy sign-in/up path writes the session to localStorage directly
  // (so we never need to call supabase from the browser to validate it) and
  // dispatches this event. Re-fetch the user from our own backend when it
  // fires so the UI flips out of the landing page immediately.
  useEffect(() => {
    function onAuthChanged() {
      refresh()
    }
    window.addEventListener('slideai:auth-changed', onAuthChanged)
    return () =>
      window.removeEventListener('slideai:auth-changed', onAuthChanged)
  }, [refresh])

  const openSignIn = useCallback(() => setSignInOpen(true), [])
  const closeSignIn = useCallback(() => setSignInOpen(false), [])
  const closePasswordReset = useCallback(() => setPasswordResetOpen(false), [])

  const signOut = useCallback(async () => {
    // Try the supabase client's signOut for cleanliness, but don't block on
    // it — the user's browser may not be able to reach *.supabase.co. The
    // local part (clearing storage) is what actually logs them out of this
    // tab, so do it ourselves regardless.
    try {
      const p = supabase.auth.signOut({ scope: 'local' })
      if (p && typeof p.then === 'function') {
        await Promise.race([
          p,
          new Promise((resolve) => setTimeout(resolve, 800)),
        ])
      }
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.removeItem('slideai-auth')
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
    passwordResetOpen,
    closePasswordReset,
  }
}
