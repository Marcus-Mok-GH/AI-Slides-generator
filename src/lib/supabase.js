import { createClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client. Reads the project URL and anon key that
 * Vite injects via `define` in vite.config.js (sourced from the
 * SUPABASE_URL / SUPABASE_ANON_KEY env vars).
 *
 * The session is persisted in localStorage and auto-refreshed by
 * supabase-js, so we don't manage tokens ourselves.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — ' +
      'authentication will not work until these are configured.',
  )
}

export const supabase = createClient(url || 'http://invalid', anonKey || 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/**
 * Resolve the current access token (or null). Used by the API client to
 * attach an `Authorization: Bearer …` header to every request.
 */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}
