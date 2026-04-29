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

// Strip trailing slashes — supabase-js appends `/auth/v1/...` and a double
// slash on some edge nodes returns a network error (surfaces as "Load
// failed" in the browser).
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

/**
 * Pull the bearer token off an incoming request.
 */
function bearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization
  if (typeof h !== 'string') return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/**
 * Map a Supabase auth user object to the columns in our `users` table
 * and best-effort upsert it. Errors don't block the request.
 */
function mirrorUser(u) {
  if (!u) return null
  const meta = u.user_metadata || {}
  // Supabase doesn't split first/last for OAuth sign-ins by default — derive
  // them from `full_name` / `name` when available.
  const fullName = meta.full_name || meta.name || ''
  const [firstFromFull, ...restFromFull] = fullName.trim().split(/\s+/)
  const user = {
    id: u.id,
    email: u.email || meta.email || null,
    firstName: meta.first_name || meta.given_name || firstFromFull || null,
    lastName:
      meta.last_name ||
      meta.family_name ||
      (restFromFull.length ? restFromFull.join(' ') : null),
    profileImageUrl: meta.avatar_url || meta.picture || null,
  }
  upsertUser(user).catch((e) =>
    console.warn('[auth] upsertUser failed:', e?.message),
  )
  return user
}

/**
 * Resolve the current user from the Bearer token. Caches the result on
 * the request so middleware composition doesn't re-verify.
 */
async function resolveSession(req) {
  if (req._authResolved) return req._authResult
  req._authResolved = true
  req._authResult = null

  if (!supabase) return null
  const token = bearerToken(req)
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const user = mirrorUser(data.user)
  if (!user) return null

  req._authResult = { user }
  return req._authResult
}

/**
 * Wires the public auth routes:
 *   GET /api/auth/user — return the current user (or 401)
 *
 * Sign-in / sign-up / sign-out all happen client-side via supabase-js,
 * so there are no callback or login routes to register here.
 */
export async function setupAuth(app) {
  app.set('trust proxy', 1)

  app.get('/api/auth/user', async (req, res) => {
    const result = await resolveSession(req)
    if (!result) return res.status(401).json({ error: 'Unauthorized' })
    res.json(result.user)
  })
}

/**
 * Express middleware: require a valid Supabase session.
 */
export const isAuthenticated = async (req, res, next) => {
  const result = await resolveSession(req)
  if (!result) return res.status(401).json({ error: 'Unauthorized' })
  req.user = result.user
  next()
}

/** Returns the current user's id, or null if not signed in. */
export function currentUserId(req) {
  return req.user?.id || req._authResult?.user?.id || null
}
