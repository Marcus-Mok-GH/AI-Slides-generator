import { Router } from 'express'
import { DECK_GENERATION_CENTS, getCredits, findUserByEmail, createUser } from '../db.js'
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
    const existing = await findUserByEmail(email)
    if (existing?.password_hash) {
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
