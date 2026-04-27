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
    const returnTo = window.location.pathname + window.location.search
    if (returnTo && returnTo !== '/') {
      try {
        localStorage.setItem('slideai:returnTo', returnTo)
      } catch {
        /* ignore quota errors */
      }
    }

    // The Replit OIDC consent page is built for the classic popup OAuth
    // flow: after the user clicks Authorize it tries to navigate
    // `window.opener` to our callback URL and then runs `window.close()`
    // on itself. Previous fixes tried to navigate the top tab into that
    // flow, which caused Replit's consent page to close the entire tab
    // instead. The fix here is to give it exactly the kind of window it
    // expects — a popup — and to use *three* parallel signals so the main
    // app reliably notices the new session regardless of which branch the
    // consent page actually takes:
    //   1. postMessage from /api/callback's success page to its opener
    //   2. a BroadcastChannel('slideai:auth') message (works even when COOP
    //      severs the opener relationship across origins)
    //   3. a 1.5s poll of /api/auth/user as a final safety net
    const w = 520
    const h = 720
    const left = Math.max(
      0,
      (window.screen?.availLeft || 0) +
        ((window.screen?.availWidth || window.innerWidth) - w) / 2,
    )
    const top = Math.max(
      0,
      (window.screen?.availTop || 0) +
        ((window.screen?.availHeight || window.innerHeight) - h) / 2,
    )
    const popup = window.open(
      '/api/login',
      'slideai-auth',
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`,
    )

    if (!popup) {
      // Pop-up blocked (rare inside the Replit preview, but possible).
      // Fall back to the legacy full-tab redirect so the user still has
      // a way through.
      window.location.href = '/api/login'
      return
    }

    let settled = false
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      if (bc) {
        try {
          bc.close()
        } catch {
          /* ignore */
        }
      }
      clearInterval(poll)
    }
    const succeed = () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        if (popup && !popup.closed) popup.close()
      } catch {
        /* cross-origin close may throw — ignore */
      }
      refresh()
    }

    const onMessage = (event) => {
      const data = event?.data
      if (data && data.type === 'slideai:auth-success') succeed()
    }
    window.addEventListener('message', onMessage)

    const bc =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('slideai:auth')
        : null
    if (bc) {
      bc.onmessage = (event) => {
        if (event?.data?.type === 'slideai:auth-success') succeed()
      }
    }

    const poll = setInterval(async () => {
      // Whether the popup is still open or already closed, the only thing
      // that matters is whether the session cookie is now valid.
      try {
        const u = await fetchCurrentUser()
        if (u) {
          succeed()
          return
        }
      } catch {
        /* network blip, try again next tick */
      }
      // If the popup closed without a successful sign-in, give up cleanly
      // so we don't poll forever.
      let closed = false
      try {
        closed = popup.closed
      } catch {
        closed = true
      }
      if (closed && !settled) {
        // Do one last check on the very next tick before giving up — the
        // cookie may have been set milliseconds before close().
        setTimeout(async () => {
          if (settled) return
          try {
            const u2 = await fetchCurrentUser()
            if (u2) {
              succeed()
              return
            }
          } catch {
            /* ignore */
          }
          if (!settled) cleanup()
        }, 250)
      }
    }, 1500)
  }, [refresh])

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
