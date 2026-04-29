import { createClient } from '@supabase/supabase-js'
import { upsertUser } from './db.js'

/**
 * Supabase-Auth-backed authentication for the Express API.
 *
 * The client signs in via @supabase/supabase-js and calls the API with
 * `Authorization: Bearer <access_token>`. We verify that token against
 * Supabase on every request — no server-side sessions or cookies.
 *
 * Env:
 *   SUPABASE_URL       — https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY  — public anon JWT
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[auth] SUPABASE_URL or SUPABASE_ANON_KEY missing — auth-protected ' +
      'routes will reject every request with 401.',
  )
}

// One shared admin-style client used to validate tokens. We call
// `auth.getUser(token)` per request — Supabase verifies the JWT signature
// and returns the user record (or an error).
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

function tokenFromRequest(req) {
  const h = req.headers.authorization || req.headers.Authorization
  if (typeof h === 'string' && h.startsWith('Bearer ')) {
    return h.slice('Bearer '.length).trim()
  }
  // SSE/EventSource can't set headers in the browser, so we accept the
  // token via ?access_token=... as a fallback. The streaming endpoint
  // still uses fetch+POST, so this is mostly future-proofing.
  if (typeof req.query?.access_token === 'string') {
    return req.query.access_token
  }
  return null
}

/**
 * Verify the JWT and attach the Supabase user (and a derived "claims" object
 * mirroring the old shape) to `req.user`. Cached per-request via a WeakMap
 * so middleware composition doesn't re-hit Supabase.
 */
async function verifyToken(req) {
  if (req._authResolved) return req._authUser || null
  req._authResolved = true

  if (!supabase) return null
  const token = tokenFromRequest(req)
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  const u = data.user
  const meta = u.user_metadata || {}
  // Support common provider fields: { name | full_name | given_name } etc.
  const fullName = meta.full_name || meta.name || ''
  const [givenFirst = '', ...rest] = fullName.split(/\s+/).filter(Boolean)
  const firstName = meta.first_name || meta.given_name || givenFirst || null
  const lastName =
    meta.last_name || meta.family_name || (rest.length ? rest.join(' ') : null)
  const profileImageUrl =
    meta.avatar_url || meta.picture || meta.profile_image_url || null

  const user = {
    id: u.id,
    email: u.email || null,
    claims: {
      sub: u.id,
      email: u.email || null,
      first_name: firstName,
      last_name: lastName,
      profile_image_url: profileImageUrl,
    },
  }

  req._authUser = user
  // Best-effort upsert into our `users` mirror table. Don't block the
  // request if Postgres hiccups.
  upsertUser({
    id: user.id,
    email: user.email,
    firstName,
    lastName,
    profileImageUrl,
  }).catch((e) => console.warn('[auth] upsertUser failed:', e?.message))

  return user
}

/**
 * Wires the public auth routes. With Supabase Auth, all the OAuth dance
 * happens in the browser — the only server-side route we need is
 * /api/auth/user (returns the current user from the bearer token).
 */
export async function setupAuth(app) {
  app.set('trust proxy', 1)

  app.get('/api/auth/user', async (req, res) => {
    const user = await verifyToken(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.claims.first_name,
      lastName: user.claims.last_name,
      profileImageUrl: user.claims.profile_image_url,
    })
  })
}

/**
 * Express middleware: require a valid Supabase access token.
 */
export const isAuthenticated = async (req, res, next) => {
  const user = await verifyToken(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}

/** Returns the current user's id, or null if not signed in. */
export function currentUserId(req) {
  return req.user?.id || req._authUser?.id || null
}
