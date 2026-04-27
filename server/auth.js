import * as client from 'openid-client'
import { Strategy } from 'openid-client/passport'
import passport from 'passport'
import session from 'express-session'
import memoize from 'memoizee'
import connectPg from 'connect-pg-simple'
import { pool, upsertUser } from './db.js'

/**
 * Replit Auth (OpenID Connect) for Express, mirroring the official
 * `javascript_log_in_with_replit` blueprint in plain JavaScript and our
 * existing `pg` Pool.
 *
 * Wires:
 *   - GET  /api/login     → start OAuth
 *   - GET  /api/callback  → OAuth callback
 *   - GET  /api/logout    → end session + redirect home
 *   - GET  /api/auth/user → JSON of current user (or 401)
 *
 * Sessions are stored in the `sessions` table (created in db.js).
 */

if (!process.env.REPLIT_DOMAINS) {
  throw new Error('Environment variable REPLIT_DOMAINS not provided')
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

  // Pre-register one Passport strategy per domain in REPLIT_DOMAINS. The
  // Replit OIDC provider only accepts redirect URIs whose host is one of
  // those domains — anything else would produce `invalid_redirect_uri`.
  // We never key the strategy on req.hostname because our Vite dev proxy
  // rewrites Host before the request reaches Express.
  const allowedDomains = process.env.REPLIT_DOMAINS.split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  const canonicalDomain = allowedDomains[0]
  const strategyName = `replitauth:${canonicalDomain}`

  for (const domain of allowedDomains) {
    passport.use(
      new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: 'openid email profile offline_access',
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      ),
    )
  }

  passport.serializeUser((user, cb) => cb(null, user))
  passport.deserializeUser((user, cb) => cb(null, user))

  app.get('/api/login', (req, res, next) => {
    console.log('[auth] /api/login from', req.headers['user-agent']?.slice(0, 60))
    passport.authenticate(strategyName, {
      prompt: 'login consent',
      scope: ['openid', 'email', 'profile', 'offline_access'],
    })(req, res, next)
  })

  app.get('/api/callback', (req, res, next) => {
    console.log(
      '[auth] /api/callback hit — query keys:',
      Object.keys(req.query),
      'has session:',
      !!req.session,
      'sid:',
      req.sessionID?.slice(0, 8),
    )
    passport.authenticate(strategyName, (err, user, info) => {
      if (err) {
        console.error('[auth] /api/callback error:', err)
        return res
          .status(500)
          .send(`<pre>Auth error: ${String(err.message || err)}</pre>`)
      }
      if (!user) {
        console.warn('[auth] /api/callback no user, info:', info)
        return res.redirect('/api/login')
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('[auth] req.login error:', loginErr)
          return res
            .status(500)
            .send(`<pre>Login error: ${String(loginErr.message || loginErr)}</pre>`)
        }
        console.log('[auth] /api/callback success → notifying opener')
        // The client opens auth in a popup and listens on three channels.
        // Hit all of them so it doesn't matter whether the opener
        // relationship survived COOP, whether the browser allows the
        // popup to close itself, or whether the page is navigated away
        // by the consent flow before our script runs:
        //   1. window.opener.postMessage   – classic popup signal
        //   2. BroadcastChannel             – works across COOP-severed origins
        //   3. fall back to a top-level redirect to "/" with a friendly
        //      "you can close this tab" message in case neither worked
        res
          .status(200)
          .set('Content-Type', 'text/html; charset=utf-8')
          .send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f1a; color: #f5f5fa; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 32px; }
    .spin { width: 32px; height: 32px; border: 3px solid #2a2a3d; border-top-color: #7c5cff; border-radius: 50%; margin: 0 auto 16px; animation: s 0.9s linear infinite; }
    @keyframes s { to { transform: rotate(360deg); } }
    .hint { opacity: 0.7; font-size: 14px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spin"></div>
    <div>Signed in. Returning to the app…</div>
    <div class="hint" id="hint"></div>
  </div>
  <script>
  (function () {
    var notified = false;
    function notify() {
      if (notified) return;
      notified = true;
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: 'slideai:auth-success' }, '*');
        }
      } catch (e) { /* opener may be cross-origin */ }
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          var bc = new BroadcastChannel('slideai:auth');
          bc.postMessage({ type: 'slideai:auth-success' });
          // Give the channel a moment to flush before we close.
          setTimeout(function () { try { bc.close(); } catch (_) {} }, 50);
        }
      } catch (e) { /* ignore */ }
    }
    notify();
    // Try to close ourselves. If we were opened with window.open() this
    // works; if not (or the browser refuses), fall through to a normal
    // navigation back to the app so the user is never stranded.
    setTimeout(function () {
      try { window.close(); } catch (e) { /* ignore */ }
      // If we're still here a beat later, we couldn't close — just go home.
      setTimeout(function () {
        if (!window.closed) {
          document.getElementById('hint').textContent =
            'You can close this tab.';
          // Only redirect if we are clearly the top-level window (not a
          // popup the parent is already navigating away from on its own).
          if (window.opener == null) {
            window.location.replace('/');
          }
        }
      }, 400);
    }, 100);
  })();
  </script>
  <noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body>
</html>`)
      })
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
