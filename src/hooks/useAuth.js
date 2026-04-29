import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Supabase-backed auth hook. We listen to onAuthStateChange so the UI
 * reacts immediately to sign-in / sign-out / token-refresh events.
 *
 * Returned shape:
 *   - user: { id, email, firstName, lastName, profileImageUrl } | null
 *   - loading: true on first load only
 *   - isAuthenticated: boolean
 *   - signOut(): clears the Supabase session
 *   - openSignIn(): opens the in-app sign-in modal (used by the landing CTAs)
 */

function userFromSupabase(u) {
  if (!u) return null
  const meta = u.user_metadata || {}
  const fullName = meta.full_name || meta.name || ''
  const [first = '', ...rest] = fullName.split(/\s+/).filter(Boolean)
  return {
    id: u.id,
    email: u.email || null,
    firstName: meta.first_name || meta.given_name || first || null,
    lastName:
      meta.last_name ||
      meta.family_name ||
      (rest.length ? rest.join(' ') : null),
    profileImageUrl:
      meta.avatar_url || meta.picture || meta.profile_image_url || null,
  }
}

export default function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signInOpen, setSignInOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(userFromSupabase(data?.session?.user))
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(userFromSupabase(session?.user))
      setLoading(false)
      if (session?.user) setSignInOpen(false)
    })

    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // If any API call returns 401 mid-session, clear local user state. The
  // Supabase listener will catch up if the session was actually revoked.
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
    await supabase.auth.signOut()
    setUser(null)
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
