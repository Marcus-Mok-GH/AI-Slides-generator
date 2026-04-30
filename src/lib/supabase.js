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
 * Resolve the current access token (or null). Used by the API client to
 * attach an `Authorization: Bearer …` header to every request.
 */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}
