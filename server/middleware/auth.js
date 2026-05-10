import { upsertUser } from '../db.js'

const VDP_HEADER = 'x-vercel-deployment-protection'

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return {}
  const [, payload] = token.split('.')
  if (!payload) return {}

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function readHeader(req, name) {
  return req.get?.(name) || req.headers?.[name.toLowerCase()] || ''
}

function readVercelOidcHeaders(req) {
  const headers = {}
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (key.startsWith('x-vercel-oidc-')) {
      headers[key] = Array.isArray(value) ? value[0] : value
    }
  }
  return headers
}

function isLocalRequest(req) {
  if (process.env.VERCEL === '1') return false
  const host = readHeader(req, 'host')
  return !host || /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host)
}

export function readVDPUser(req) {
  const protection = readHeader(req, VDP_HEADER)
  const authorized = protection.toLowerCase() === 'authorized'

  if (!authorized && !isLocalRequest(req)) {
    return null
  }

  const oidcHeaders = readVercelOidcHeaders(req)
  const claims = decodeJwtPayload(oidcHeaders['x-vercel-oidc-token'])
  const rawName =
    oidcHeaders['x-vercel-oidc-name'] ||
    claims.name ||
    claims.username ||
    ''
  const { firstName, lastName } = splitName(rawName)
  const email =
    oidcHeaders['x-vercel-oidc-email'] ||
    claims.email ||
    ''
  const id =
    oidcHeaders['x-vercel-oidc-user-id'] ||
    oidcHeaders['x-vercel-oidc-sub'] ||
    claims.user_id ||
    claims.sub ||
    email ||
    (isLocalRequest(req) ? 'local-vdp-user' : '')

  if (!id) return null

  return {
    id: String(id),
    email: email ? String(email) : null,
    firstName: firstName || null,
    lastName: lastName || null,
    profileImageUrl:
      oidcHeaders['x-vercel-oidc-picture'] ||
      claims.picture ||
      null,
    vdpAuthorized: authorized,
  }
}

export function readVDPHeaders(req, _res, next) {
  req.vdpUser = readVDPUser(req)
  next()
}

export async function trustVDPHeaders(req, res, next) {
  const user = req.vdpUser || readVDPUser(req)
  if (!user) {
    return res.status(401).json({ error: 'VDP authorization required' })
  }

  req.user = user

  try {
    const dbUser = await upsertUser(user)
    if (dbUser) {
      req.user = {
        ...user,
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.first_name,
        lastName: dbUser.last_name,
        profileImageUrl: dbUser.profile_image_url,
        creditsCents: dbUser.credits_cents,
      }
    }
  } catch (err) {
    if (err?.statusCode !== 503) {
      console.warn('[auth] failed to upsert VDP user:', err?.message || err)
    }
  }

  next()
}
