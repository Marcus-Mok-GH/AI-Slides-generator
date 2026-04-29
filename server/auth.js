import { WorkOS } from '@workos-inc/node'
import { upsertUser } from './db.js'

/**
 * WorkOS AuthKit authentication for the Express API.
 *
 * Sign-in flow:
 *   1. Browser hits   /api/auth/login           -> 302 to WorkOS hosted page
 *   2. WorkOS hits    /api/auth/callback?code=  -> we exchange the code,
 *      seal the session into an HttpOnly cookie, then 302 the user back to
 *      the SPA (or `?returnTo=` if it was provided).
 *   3. Every API request reads the cookie via `loadSealedSession`, which
 *      verifies + (silently) refreshes the WorkOS access token as needed.
 *   4. /api/auth/logout clears the cookie and 302's to WorkOS's logout URL.
 *
 * Env:
 *   WORKOS_API_KEY          - secret API key (sk_...)
 *   WORKOS_CLIENT_ID        - AuthKit client id (client_...)
 *   WORKOS_COOKIE_PASSWORD  - 32+ char string used to seal the session cookie
 *   WORKOS_REDIRECT_URI     - optional override; otherwise derived from request
 */

const SESSION_COOKIE = 'wos_session'
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const apiKey = process.env.WORKOS_API_KEY
const clientId = process.env.WORKOS_CLIENT_ID
const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD

if (!apiKey || !clientId || !cookiePassword) {
  console.warn(
    '[auth] WORKOS_API_KEY, WORKOS_CLIENT_ID or WORKOS_COOKIE_PASSWORD ' +
      'missing — auth-protected routes will reject every request with 401.',
  )
}

const workos =
  apiKey && clientId
    ? new WorkOS(apiKey, { clientId })
    : null

/**
 * Build an absolute URL for /api/auth/callback. We prefer an explicit
 * WORKOS_REDIRECT_URI env var so the value matches exactly what's
 * registered in the WorkOS dashboard; otherwise we derive it from the
 * incoming request (handy for the Replit dev domain).
 */
function callbackUrl(req) {
  if (process.env.WORKOS_REDIRECT_URI) return process.env.WORKOS_REDIRECT_URI
  const proto =
    req.headers['x-forwarded-proto']?.toString().split(',')[0].trim() ||
    req.protocol
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}/api/auth/callback`
}

function setSessionCookie(res, sealedSession) {
  res.cookie(SESSION_COOKIE, sealedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE * 1000,
  })
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

/**
 * Map a WorkOS user object to our internal shape (mirrors the columns in
 * the `users` table) and best-effort upsert it. Errors don't block the
 * request — auth still succeeds even if Postgres hiccups.
 */
function mirrorUser(u) {
  if (!u) return null
  const user = {
    id: u.id,
    email: u.email || null,
    firstName: u.firstName || u.first_name || null,
    lastName: u.lastName || u.last_name || null,
    profileImageUrl: u.profilePictureUrl || u.profile_picture_url || null,
  }
  upsertUser(user).catch((e) =>
    console.warn('[auth] upsertUser failed:', e?.message),
  )
  return user
}

/**
 * Resolve the current user from the sealed session cookie. Caches the
 * result on the request so middleware composition doesn't re-decrypt.
 *
 * Returns { user, sealedSession } if authenticated, or null otherwise.
 * If the access token was refreshed, `sealedSession` is the *new* sealed
 * value the caller should write back to the cookie.
 */
async function resolveSession(req) {
  if (req._authResolved) return req._authResult
  req._authResolved = true
  req._authResult = null

  if (!workos || !cookiePassword) return null
  const sealed = req.cookies?.[SESSION_COOKIE]
  if (!sealed) return null

  const session = workos.userManagement.loadSealedSession({
    sessionData: sealed,
    cookiePassword,
  })

  let result = await session.authenticate()

  // Access token expired -> try a silent refresh.
  if (!result.authenticated && result.reason === 'no_session_cookie_provided') {
    return null
  }
  if (!result.authenticated) {
    try {
      const refreshed = await session.refresh()
      if (!refreshed.authenticated) return null
      result = refreshed
    } catch {
      return null
    }
  }

  const user = mirrorUser(result.user)
  if (!user) return null

  req._authResult = {
    user,
    sealedSession: result.sealedSession || null,
  }
  return req._authResult
}

/**
 * Wires the public auth routes:
 *   GET  /api/auth/login     - redirect to WorkOS authorization URL
 *   GET  /api/auth/callback  - exchange code, set cookie, redirect home
 *   POST /api/auth/logout    - clear cookie, redirect to WorkOS logout
 *   GET  /api/auth/user      - return the current user (or 401)
 */
export async function setupAuth(app) {
  app.set('trust proxy', 1)

  app.get('/api/auth/login', (req, res) => {
    if (!workos) return res.status(500).send('Auth not configured')

    // Stash where to send the user back to after sign-in (relative paths only).
    const returnTo =
      typeof req.query.returnTo === 'string' &&
      req.query.returnTo.startsWith('/')
        ? req.query.returnTo
        : '/'

    const url = workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      clientId,
      redirectUri: callbackUrl(req),
      state: Buffer.from(JSON.stringify({ returnTo })).toString('base64url'),
    })
    res.redirect(url)
  })

  app.get('/api/auth/callback', async (req, res) => {
    if (!workos) return res.status(500).send('Auth not configured')
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    if (!code) return res.status(400).send('Missing code')

    let returnTo = '/'
    try {
      if (typeof req.query.state === 'string') {
        const decoded = JSON.parse(
          Buffer.from(req.query.state, 'base64url').toString('utf8'),
        )
        if (typeof decoded?.returnTo === 'string' && decoded.returnTo.startsWith('/')) {
          returnTo = decoded.returnTo
        }
      }
    } catch {
      /* ignore malformed state */
    }

    try {
      const { user, sealedSession } =
        await workos.userManagement.authenticateWithCode({
          code,
          clientId,
          session: { sealSession: true, cookiePassword },
        })

      mirrorUser(user)
      setSessionCookie(res, sealedSession)
      res.redirect(returnTo)
    } catch (err) {
      console.error('[auth] callback failed:', err?.message || err)
      res.status(401).send('Sign-in failed. Please try again.')
    }
  })

  app.all('/api/auth/logout', async (req, res) => {
    const sealed = req.cookies?.[SESSION_COOKIE]
    let logoutUrl = null
    if (workos && cookiePassword && sealed) {
      try {
        const session = workos.userManagement.loadSealedSession({
          sessionData: sealed,
          cookiePassword,
        })
        logoutUrl = await session.getLogoutUrl()
      } catch {
        /* ignore — we'll just clear the cookie locally */
      }
    }
    clearSessionCookie(res)
    if (logoutUrl) return res.redirect(logoutUrl)
    res.json({ ok: true })
  })

  app.get('/api/auth/user', async (req, res) => {
    const result = await resolveSession(req)
    if (!result) return res.status(401).json({ error: 'Unauthorized' })
    if (result.sealedSession) setSessionCookie(res, result.sealedSession)
    res.json(result.user)
  })
}

/**
 * Express middleware: require a valid WorkOS session.
 */
export const isAuthenticated = async (req, res, next) => {
  const result = await resolveSession(req)
  if (!result) return res.status(401).json({ error: 'Unauthorized' })
  if (result.sealedSession) setSessionCookie(res, result.sealedSession)
  req.user = result.user
  next()
}

/** Returns the current user's id, or null if not signed in. */
export function currentUserId(req) {
  return req.user?.id || req._authResult?.user?.id || null
}
