import * as client from 'openid-client'
import { Strategy } from 'openid-client/passport'
import passport from 'passport'
import session from 'express-session'
import memoize from 'memoizee'
import connectPg from 'connect-pg-simple'
import { pool, upsertUser } from './db.js'

/**
 * Replit Auth (OpenID Connect) for Express. Adapted from the official
 * Replit Auth blueprint into plain JavaScript and our existing `pg` Pool.
 *
 * Wires:
 *   - GET  /api/login     → start OAuth
 *   - GET  /api/callback  → OAuth callback
 *   - GET  /api/logout    → end session + redirect home
 *   - GET  /api/auth/user → JSON of current user (or 401)
 *
 * Sessions are stored in the `sessions` table (created in db.js).
 */

if (!process.env.REPL_ID) {
  console.warn('[auth] REPL_ID is not set — Replit Auth will not work.')
}
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET is not set — sessions will be insecure.')
}

const getOidcConfig = memoize(
  async () =>
    client.discovery(
      new URL(process.env.ISSUER_URL ?? 'https://replit.com/oidc'),
      process.env.REPL_ID,
    ),
  { maxAge: 3600 * 1000 },
)

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000 // 1 week
  const PgStore = connectPg(session)
  const sessionStore = new PgStore({
    pool,
    createTableIfMissing: false, // we create it ourselves in migrate()
    ttl: sessionTtl,
    tableName: 'sessions',
  })
  return session({
    name: 'slideai.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  })
}

function updateUserSession(user, tokens) {
  user.claims = tokens.claims()
  user.access_token = tokens.access_token
  user.refresh_token = tokens.refresh_token
  user.expires_at = user.claims?.exp
}

async function upsertUserFromClaims(claims) {
  await upsertUser({
    id: claims.sub,
    email: claims.email || null,
    firstName: claims.first_name || null,
    lastName: claims.last_name || null,
    profileImageUrl: claims.profile_image_url || null,
  })
}

export async function setupAuth(app) {
  app.set('trust proxy', 1)
  app.use(getSession())
  app.use(passport.initialize())
  app.use(passport.session())

  const config = await getOidcConfig()

  const verify = async (tokens, verified) => {
    const user = {}
    updateUserSession(user, tokens)
    try {
      await upsertUserFromClaims(tokens.claims())
    } catch (e) {
      return verified(e)
    }
    verified(null, user)
  }

  // Strategies are registered lazily per hostname (Replit dev domains differ
  // from production custom domains — we want all of them to work).
  const registered = new Set()
  const ensureStrategy = (hostname) => {
    const name = `replitauth:${hostname}`
    if (registered.has(name)) return
    passport.use(
      new Strategy(
        {
          name,
          config,
          scope: 'openid email profile offline_access',
          callbackURL: `https://${hostname}/api/callback`,
        },
        verify,
      ),
    )
    registered.add(name)
  }

  passport.serializeUser((user, cb) => cb(null, user))
  passport.deserializeUser((user, cb) => cb(null, user))

  app.get('/api/login', (req, res, next) => {
    ensureStrategy(req.hostname)
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: 'login consent',
      scope: ['openid', 'email', 'profile', 'offline_access'],
    })(req, res, next)
  })

  app.get('/api/callback', (req, res, next) => {
    ensureStrategy(req.hostname)
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: '/',
      failureRedirect: '/api/login',
    })(req, res, next)
  })

  app.get('/api/logout', (req, res) => {
    req.logout(() => {
      const endSession = client.buildEndSessionUrl(config, {
        client_id: process.env.REPL_ID,
        post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
      }).href
      res.redirect(endSession)
    })
  })

  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const claims = req.user?.claims || {}
      res.json({
        id: claims.sub,
        email: claims.email || null,
        firstName: claims.first_name || null,
        lastName: claims.last_name || null,
        profileImageUrl: claims.profile_image_url || null,
      })
    } catch (e) {
      console.error('[auth] /api/auth/user error:', e)
      res.status(500).json({ error: 'Failed to fetch user' })
    }
  })
}

/**
 * Express middleware that requires the user to be signed in. If the access
 * token has expired, attempts a single refresh-token grant before failing.
 */
export const isAuthenticated = async (req, res, next) => {
  const user = req.user
  if (!req.isAuthenticated?.() || !user?.expires_at) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const now = Math.floor(Date.now() / 1000)
  if (now <= user.expires_at) return next()

  if (!user.refresh_token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const config = await getOidcConfig()
    const tokens = await client.refreshTokenGrant(config, user.refresh_token)
    updateUserSession(user, tokens)
    return next()
  } catch (e) {
    console.warn('[auth] refresh failed:', e.message || e)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

/** Returns the current user's id, or null if not signed in. */
export function currentUserId(req) {
  return req.user?.claims?.sub || null
}
