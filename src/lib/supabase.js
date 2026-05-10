/**
 * Minimal Supabase client stub — the app is fully public, no auth needed.
 * If you later need a real Supabase client, install @supabase/supabase-js
 * and restore the createClient call here.
 */

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
  },
}
