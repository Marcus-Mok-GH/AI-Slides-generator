import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { upsertUser, findUserByEmail, createUser } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'slideai-dev-secret-change-me'
const JWT_EXPIRES_IN = '7d'

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName || user.first_name || null,
      lastName: user.lastName || user.last_name || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash)
}

function getTokenFromRequest(req) {
  const auth = req.get?.('authorization') || req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req)
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    const dbUser = await findUserByEmail(decoded.email)
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' })
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.first_name,
      lastName: dbUser.last_name,
      profileImageUrl: dbUser.profile_image_url,
      creditsCents: dbUser.credits_cents,
    }
    next()
  } catch (err) {
    console.error('[auth] middleware error:', err?.message || err)
    return res.status(500).json({ error: 'Authentication failed' })
  }
}

export async function optionalAuthMiddleware(req, _res, next) {
  const token = getTokenFromRequest(req)
  if (token) {
    const decoded = verifyToken(token)
    if (decoded) {
      try {
        const dbUser = await findUserByEmail(decoded.email)
        if (dbUser) {
          req.user = {
            id: dbUser.id,
            email: dbUser.email,
            firstName: dbUser.first_name,
            lastName: dbUser.last_name,
            profileImageUrl: dbUser.profile_image_url,
            creditsCents: dbUser.credits_cents,
          }
        }
      } catch {
        // ignore optional auth failures
      }
    }
  }
  next()
}
