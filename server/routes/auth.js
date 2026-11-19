import { Router } from 'express'
import {
  getCredits, findUserByEmail, createUser, updateUserLastLogin,
  markUserEmailVerified, updateUserPassword,
} from '../db.js'
import { BASE_DECK_CENTS } from '../../src/lib/pricing.js'
import { hashPassword, comparePassword, signToken } from '../middleware/auth.js'
import {
  isEmailConfigured, sendVerificationCodeEmail, sendPasswordResetCodeEmail,
} from '../mailer.js'
import {
  PURPOSE_VERIFY_EMAIL, PURPOSE_RESET_PASSWORD,
  issueOtp, checkOtp, otpErrorMessage,
} from '../otp.js'

const router = Router()

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6
}

/** Shared response shape for every endpoint that starts a session. */
function sessionPayload(user) {
  const firstName = user.first_name ?? user.firstName ?? null
  const lastName = user.last_name ?? user.lastName ?? null
  return {
    token: signToken({ id: user.id, email: user.email, firstName, lastName }),
    user: {
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      profileImageUrl: user.profile_image_url ?? null,
      emailVerified: user.email_verified !== false,
    },
    credits: {
      balanceCents: user.credits_cents,
      deckCostCents: BASE_DECK_CENTS,
    },
  }
}

/* ---------------- throttle ---------------- */

const THROTTLE_WINDOW_MS = 60 * 60 * 1000
const THROTTLE_MAX = 10
const throttleHits = new Map()

/**
 * Per-instance throttle for the endpoints that can send email or guess a code.
 * Not a shared store, but it stops one client from using the app as an email
 * cannon or grinding six-digit codes, and it costs no round trip.
 */
function tooManyRequests(key) {
  const now = Date.now()
  const recent = (throttleHits.get(key) || []).filter((t) => now - t < THROTTLE_WINDOW_MS)
  recent.push(now)
  if (throttleHits.size > 1000) {
    for (const [k, times] of throttleHits) {
      if (!times.some((t) => now - t < THROTTLE_WINDOW_MS)) throttleHits.delete(k)
    }
  }
  throttleHits.set(key, recent)
  return recent.length > THROTTLE_MAX
}

function clientKey(req) {
  return String(
    req.get?.('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown',
  )
}

/** Send a code without letting a delivery failure break the auth flow. */
async function trySendCode({ to, code, purpose }) {
  try {
    if (purpose === PURPOSE_RESET_PASSWORD) {
      await sendPasswordResetCodeEmail({ to, code })
    } else {
      await sendVerificationCodeEmail({ to, code })
    }
    return true
  } catch (err) {
    console.error('[auth] code email failed:', err?.message || err)
    return false
  }
}

/** Issue and send a code for an existing user. Returns true if one was sent. */
async function sendCode(userId, email, purpose) {
  const code = await issueOtp({ userId, purpose })
  if (!code) return false // a code went out moments ago; keep the old one valid
  return trySendCode({ to: email, code, purpose })
}

/* ---------------- signup ---------------- */

router.post('/register', async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const normalized = email.toLowerCase().trim()

  try {
    // Any existing row blocks re-registration. Without this check, a stranger
    // could set a password on a Google-only account (no password_hash) and
    // take it over — Google sign-in is the account-linking path instead.
    const existing = await findUserByEmail(normalized)
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    // Without an email provider we cannot verify anyone, so don't lock people
    // out of a self-hosted install that has no mail configured.
    const emailConfigured = isEmailConfigured()
    const passwordHash = await hashPassword(password)
    const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    const user = await createUser({
      id,
      email: normalized,
      passwordHash,
      emailVerified: !emailConfigured,
    })

    // The code still goes out, but it no longer withholds the session: a
    // visitor who has just decided to try the product gets to their deck now
    // and confirms the address from the account menu afterwards. Verification
    // stays mandatory for password reset.
    const emailSent = emailConfigured
      ? await sendCode(user.id, user.email, PURPOSE_VERIFY_EMAIL)
      : false

    await updateUserLastLogin(user.id)
    res.status(201).json({
      ...sessionPayload(user),
      ...(emailConfigured
        ? { verificationPending: true, email: user.email, emailSent }
        : {}),
    })
  } catch (err) {
    console.error('[auth/register] error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

/* ---------------- email verification ---------------- */

router.post('/verify-email', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
  const { code } = req.body || {}

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (tooManyRequests(`verify:${clientKey(req)}`)) {
    return res.status(429).json({ error: 'Too many attempts — try again in an hour' })
  }

  try {
    const user = await findUserByEmail(email)
    // Generic failure: whether this address has an account is not public.
    if (!user) {
      return res.status(400).json({ error: otpErrorMessage('mismatch') })
    }
    if (user.email_verified) {
      await updateUserLastLogin(user.id)
      return res.json(sessionPayload(user))
    }

    const result = await checkOtp({
      userId: user.id,
      purpose: PURPOSE_VERIFY_EMAIL,
      code,
    })
    if (!result.ok) {
      return res.status(400).json({ error: otpErrorMessage(result.reason) })
    }

    await markUserEmailVerified(user.id)
    await updateUserLastLogin(user.id)
    res.json(sessionPayload({ ...user, email_verified: true }))
  } catch (err) {
    console.error('[auth/verify-email] error:', err)
    res.status(500).json({ error: 'Could not verify that code. Please try again.' })
  }
})

router.post('/resend-verification', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Email verification is not configured on this server' })
  }
  if (tooManyRequests(`resend:${clientKey(req)}`)) {
    return res.status(429).json({ error: 'Too many requests — try again in an hour' })
  }

  try {
    const user = await findUserByEmail(email)
    if (user && !user.email_verified) {
      await sendCode(user.id, user.email, PURPOSE_VERIFY_EMAIL)
    }
  } catch (err) {
    console.error('[auth/resend-verification] error:', err?.message || err)
  }

  res.json({ ok: true })
})

/* ---------------- sign in ---------------- */

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const user = await findUserByEmail(email.toLowerCase().trim())
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // A correct password is enough to sign in. An unverified address is a
    // confirmation still outstanding, not a locked account — the app keeps
    // asking for it from the account menu. A host with no email channel at all
    // promotes the account instead, because there is no way to ever confirm.
    if (!user.email_verified && !isEmailConfigured()) {
      await markUserEmailVerified(user.id)
      user.email_verified = true
    }

    await updateUserLastLogin(user.id)
    res.json(sessionPayload(user))
  } catch (err) {
    console.error('[auth/login] error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

/* ---------------- password reset ---------------- */

router.post('/forgot-password', async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({ error: 'Password reset is not configured on this server' })
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (tooManyRequests(`forgot:${clientKey(req)}`)) {
    return res.status(429).json({ error: 'Too many reset requests — try again in an hour' })
  }

  try {
    const user = await findUserByEmail(email)
    // Google-only accounts have no password to reset; they sign in with Google.
    if (user?.password_hash) {
      await sendCode(user.id, user.email, PURPOSE_RESET_PASSWORD)
    }
  } catch (err) {
    // Logged, not surfaced: a specific error would reveal which addresses exist.
    console.error('[auth/forgot-password] error:', err?.message || err)
  }

  res.json({ ok: true })
})

router.post('/reset-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
  const { code, password } = req.body || {}

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }
  if (tooManyRequests(`reset:${clientKey(req)}`)) {
    return res.status(429).json({ error: 'Too many attempts — try again in an hour' })
  }

  try {
    const user = await findUserByEmail(email)
    if (!user) {
      return res.status(400).json({ error: otpErrorMessage('mismatch') })
    }

    const result = await checkOtp({
      userId: user.id,
      purpose: PURPOSE_RESET_PASSWORD,
      code,
    })
    if (!result.ok) {
      return res.status(400).json({ error: otpErrorMessage(result.reason) })
    }

    await updateUserPassword(user.id, await hashPassword(password))

    // Reset does not prove they own the inbox on its own, so an unverified
    // account still has to confirm before it gets a session.
    if (!user.email_verified && isEmailConfigured()) {
      await sendCode(user.id, user.email, PURPOSE_VERIFY_EMAIL)
      return res.json({ verificationRequired: true, email: user.email })
    }

    if (!user.email_verified) {
      await markUserEmailVerified(user.id)
      user.email_verified = true
    }

    await updateUserLastLogin(user.id)
    res.json(sessionPayload(user))
  } catch (err) {
    console.error('[auth/reset-password] error:', err)
    res.status(500).json({ error: 'Could not reset your password. Please try again.' })
  }
})

/* ---------------- Google sign-in ---------------- */

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'

/**
 * Verify a Google ID token by asking Google's tokeninfo endpoint, then check
 * the audience and email_verified claims ourselves. Returns the token claims.
 */
export async function verifyGoogleIdToken(idToken) {
  const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error('Google rejected the sign-in token')
  }
  const claims = await resp.json()
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (claims.aud !== clientId) {
    throw new Error('Google token was not issued for this app')
  }
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    throw new Error('Google account email is not verified')
  }
  return claims
}

router.post('/google', async (req, res) => {
  const { idToken } = req.body || {}

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'Missing Google identity token' })
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured' })
  }

  try {
    const claims = await verifyGoogleIdToken(idToken)
    const email = String(claims.email || '').toLowerCase().trim()
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Google account did not return a usable email' })
    }

    // Link by verified email: an existing email/password account signs in
    // through Google seamlessly; a new email gets a passwordless account.
    // Google has already proven the address, so the account is verified.
    let user = await findUserByEmail(email)
    if (!user) {
      const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      user = await createUser({
        id,
        email,
        firstName: claims.given_name?.trim() || null,
        lastName: claims.family_name?.trim() || null,
        passwordHash: null,
        profileImageUrl: claims.picture || null,
        emailVerified: true,
      })
    } else if (!user.email_verified) {
      await markUserEmailVerified(user.id)
      user.email_verified = true
    }

    await updateUserLastLogin(user.id)
    res.json(sessionPayload(user))
  } catch (err) {
    console.error('[auth/google] error:', err)
    res.status(401).json({ error: err?.message || 'Google sign-in failed' })
  }
})

/* ---------------- current user ---------------- */

router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  let creditsCents = req.user.creditsCents
  if (typeof creditsCents !== 'number') {
    try {
      creditsCents = await getCredits(req.user.id)
    } catch {
      creditsCents = null
    }
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      profileImageUrl: req.user.profileImageUrl,
      emailVerified: req.user.emailVerified !== false,
    },
    credits: {
      balanceCents: creditsCents,
      deckCostCents: BASE_DECK_CENTS,
    },
  })
})

export default router
