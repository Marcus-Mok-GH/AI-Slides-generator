import { createClient } from '@supabase/supabase-js'
import { upsertUser } from './db.js'

/**
 * Supabase Auth integration for the Express API.
 *
 * The browser holds the session (issued by Supabase Auth) in localStorage
 * and sends the access token on every request via:
 *
 *     Authorization: Bearer <jwt>
 *
 * We verify the token by calling `supabase.auth.getUser(jwt)`, which
 * reaches out to the Supabase Auth server (cached internally). On success
 * we mirror the user into our local `users` table and stash them on
 * `req.user`.
 *
 * Env:
 *   SUPABASE_URL        - https://<project>.supabase.co
 *   SUPABASE_ANON_KEY   - public anon key (safe to ship to the browser too)
 */

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[auth] SUPABASE_URL or SUPABASE_ANON_KEY missing — auth-protected ' +
      'routes will reject every request with 401.',
  )
}

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

function bearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization
  if (typeof h !== 'string') return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

function toLocalUser(u) {
  if (!u) return null
  const meta = u.user_metadata || {}
  const fullName = meta.full_name || meta.name || ''
  const [firstFromFull, ...restFromFull] = fullName.trim().split(/\s+/)
  return {
    id: u.id,
    email: u.email || meta.email || null,
    firstName: meta.first_name || meta.given_name || firstFromFull || null,
    lastName:
      meta.last_name ||
      meta.family_name ||
      (restFromFull.length ? restFromFull.join(' ') : null),
    profileImageUrl: meta.avatar_url || meta.picture || null,
  }
}

async function mirrorUser(u) {
  const user = toLocalUser(u)
  if (!user) return null
  try {
    await upsertUser(user)
  } catch (e) {
    console.warn('[auth] upsertUser failed:', e?.message)
  }
  return user
}

async function resolveSession(req) {
  if (req._authResolved) return req._authResult
  req._authResolved = true
  req._authResult = null

  if (!supabase) return null
  const token = bearerToken(req)
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const user = await mirrorUser(data.user)
  if (!user) return null

  req._authResult = { user }
  return req._authResult
}

export async function setupAuth(app) {
  app.set('trust proxy', 1)

  app.get('/api/auth/user', async (req, res) => {
    const result = await resolveSession(req)
    if (!result) return res.status(401).json({ error: 'Unauthorized' })
    res.json(result.user)
  })

  app.post('/api/auth/password/signin', async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: 'Auth is not configured.' })
    }
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password),
      })
      if (error) {
        return res
          .status(error.status || 400)
          .json({ error: error.message, code: error.code || error.error_code })
      }
      const user = await mirrorUser(data.user)
      res.json({ session: data.session, user })
    } catch (err) {
      console.error('[auth/signin] proxy error:', err)
      res.status(502).json({ error: err?.message || 'Sign-in failed.' })
    }
  })

  app.post('/api/auth/password/signup', async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: 'Auth is not configured.' })
    }
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: String(email).trim(),
        password: String(password),
      })
      if (error) {
        return res
          .status(error.status || 400)
          .json({ error: error.message, code: error.code || error.error_code })
      }
      const identities = data.user?.identities
      if (
        data.user &&
        Array.isArray(identities) &&
        identities.length === 0 &&
        !data.session
      ) {
        return res.status(400).json({
          error: 'An account with that email already exists. Try signing in instead.',
          code: 'user_already_exists',
        })
      }
      const user = data.user ? await mirrorUser(data.user) : null
      res.json({ session: data.session, user, needsConfirmation: !data.session })
    } catch (err) {
      console.error('[auth/signup] proxy error:', err)
      res.status(502).json({ error: err?.message || 'Sign-up failed.' })
    }
  })

  app.post('/api/auth/password/magic', async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: 'Auth is not configured.' })
    }
    const { email, redirectTo } = req.body || {}
    if (!email) return res.status(400).json({ error: 'Email is required.' })
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: String(email).trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo ? String(redirectTo) : undefined,
        },
      })
      if (error) {
        return res
          .status(error.status || 400)
          .json({ error: error.message, code: error.code || error.error_code })
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[auth/magic] proxy error:', err)
      res.status(502).json({ error: err?.message || 'Magic link failed.' })
    }
  })

  app.post('/api/auth/password/reset', async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: 'Auth is not configured.' })
    }
    const { email, redirectTo } = req.body || {}
    if (!email) return res.status(400).json({ error: 'Email is required.' })
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        String(email).trim(),
        redirectTo ? { redirectTo: String(redirectTo) } : undefined,
      )
      if (error) {
        return res
          .status(error.status || 400)
          .json({ error: error.message, code: error.code || error.error_code })
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[auth/reset] proxy error:', err)
      res.status(502).json({ error: err?.message || 'Reset failed.' })
    }
  })
}

export const isAuthenticated = async (req, res, next) => {
  const result = await resolveSession(req)
  if (!result) return res.status(401).json({ error: 'Unauthorized' })
  req.user = result.user
  next()
}

export function currentUserId(req) {
  return req.user?.id || req._authResult?.user?.id || null
}
