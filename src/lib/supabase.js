import { createClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client. Reads the project URL and anon key that
 * Vite injects via `define` in vite.config.js (sourced from the
 * SUPABASE_URL / SUPABASE_ANON_KEY env vars).
 *
 * The session is persisted in localStorage and auto-refreshed by
 * supabase-js, so we don't manage tokens ourselves.
 */
// Normalize: supabase-js builds URLs by appending `/auth/v1/...`, so a
// trailing slash on the project URL produces a double slash that some edge
// nodes reject (the browser then surfaces a generic "Load failed" /
// TypeError from fetch).
const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const url = rawUrl.replace(/\/+$/, '')
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — ' +
      'authentication will not work until these are configured.',
  )
}

// HMR safety: keep ONE GoTrue/Supabase client per browser context. Without
// this, every Vite hot-reload of any module that imports supabase creates
// a fresh client sharing the same localStorage key. Multiple GoTrue
// instances race on token refresh and cancel each other's fetches, which
// surfaces in the browser as a generic "Load failed" error on sign-in /
// sign-up calls. Pin the singleton on globalThis so HMR re-evaluations
// reuse it.
const SUPABASE_SINGLETON_KEY = '__slideai_supabase_client__'

function buildClient() {
  return createClient(url || 'http://invalid', anonKey || 'invalid', {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'slideai-auth',
    },
  })
}

export const supabase =
  globalThis[SUPABASE_SINGLETON_KEY] ||
  (globalThis[SUPABASE_SINGLETON_KEY] = buildClient())

if (typeof window !== 'undefined' && !globalThis.__slideai_auth_logged__) {
  globalThis.__slideai_auth_logged__ = true
  console.info('[supabase] client init →', { url, hasAnonKey: !!anonKey })
}

/**
 * In-memory access-token cache, kept in sync by the proxy auth flow
 * (see `persistSessionLocally` in src/lib/api.js).
 *
 * Why this exists: supabase-js loads the session from localStorage **once**
 * during its async `_initialize()` step. After that, `getSession()` returns
 * the cached `currentSession` — manual writes to the storage key are
 * invisible to it until the next page reload or until something forces a
 * re-read. Our proxy sign-in / sign-up flow writes the session straight to
 * localStorage (because the browser can't reach *.supabase.co directly),
 * so without this cache `getAccessToken()` would return `null` for the
 * rest of the session and every authenticated request would 401.
 */
let cachedAccessToken = null

/**
 * Stash an access token (or `null` to clear) in the in-memory cache.
 * Called from the auth proxy path right after we persist the session.
 */
export function setCachedAccessToken(token) {
  cachedAccessToken = token || null
}

/**
 * Resolve the current access token (or null). Used by the API client to
 * attach an `Authorization: Bearer …` header to every request.
 *
 * Resolution order:
 *   1. The in-memory cache (set by the proxy auth flow).
 *   2. supabase-js's own session (covers reloads, OAuth redirects, magic
 *      link redirects — anything where supabase-js was the one who wrote
 *      the session).
 *   3. localStorage directly, as a last-resort fallback for the brief
 *      window between persisting the session and supabase-js noticing.
 */
export async function getAccessToken() {
  if (cachedAccessToken) return cachedAccessToken
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) {
      cachedAccessToken = data.session.access_token
      return cachedAccessToken
    }
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = window?.localStorage?.getItem('slideai-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      const token =
        parsed?.access_token || parsed?.currentSession?.access_token || null
      if (token) {
        cachedAccessToken = token
        return token
      }
    }
  } catch {
    /* ignore */
  }
  return null
}
