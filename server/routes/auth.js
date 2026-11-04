import { Router } from 'express'
import { DECK_GENERATION_CENTS, getCredits, findUserByEmail, createUser, updateUserLastLogin } from '../db.js'
import { hashPassword, comparePassword, signToken } from '../middleware/auth.js'

const router = Router()

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6
}

router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body || {}

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    // Any existing row blocks re-registration. Without this check, a stranger
    // could set a password on a Google-only account (no password_hash) and
    // take it over — Google sign-in is the account-linking path instead.
    const existing = await findUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await hashPassword(password)
    const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    const user = await createUser({
      id,
      email: email.toLowerCase().trim(),
      firstName: firstName?.trim() || null,
      lastName: lastName?.trim() || null,
      passwordHash,
    })

    const token = signToken(user)
    await updateUserLastLogin(user.id)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profileImageUrl: user.profile_image_url,
      },
      credits: {
        balanceCents: user.credits_cents,
        deckCostCents: DECK_GENERATION_CENTS,
      },
    })
  } catch (err) {
    console.error('[auth/register] error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

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

    const token = signToken(user)
    await updateUserLastLogin(user.id)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profileImageUrl: user.profile_image_url,
      },
      credits: {
        balanceCents: user.credits_cents,
        deckCostCents: DECK_GENERATION_CENTS,
      },
    })
  } catch (err) {
    console.error('[auth/login] error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

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
      })
    }

    const token = signToken(user)
    await updateUserLastLogin(user.id)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profileImageUrl: user.profile_image_url,
      },
      credits: {
        balanceCents: user.credits_cents,
        deckCostCents: DECK_GENERATION_CENTS,
      },
    })
  } catch (err) {
    console.error('[auth/google] error:', err)
    res.status(401).json({ error: err?.message || 'Google sign-in failed' })
  }
})

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
    },
    credits: {
      balanceCents: creditsCents,
      deckCostCents: DECK_GENERATION_CENTS,
    },
  })
})

export default router
