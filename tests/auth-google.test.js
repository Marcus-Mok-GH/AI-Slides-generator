/**
 * Tests for POST /api/auth/google (Google Identity Services sign-in) and the
 * register-route guard that prevents password takeover of Google-only accounts.
 *
 * Strategy:
 *  - vi.mock server/db.js so no database is needed.
 *  - vi.stubGlobal('fetch', …) intercepts ONLY Google's tokeninfo URL; every
 *    other URL (the test's own HTTP calls to the local Express app) falls
 *    through to the real fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'

vi.mock('../server/db.js', () => ({
  DECK_GENERATION_CENTS: 50,
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUserLastLogin: vi.fn(async () => {}),
  getCredits: vi.fn(async () => 500),
  // Google and password-reset paths mark accounts verified / change passwords.
  markUserEmailVerified: vi.fn(async () => {}),
  updateUserPassword: vi.fn(async () => true),
}))

import { findUserByEmail, createUser } from '../server/db.js'
import authRouter from '../server/routes/auth.js'

const realFetch = globalThis.fetch
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  try {
    await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function stubTokeninfo(response) {
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com/tokeninfo')) {
      return {
        ok: response.ok !== false,
        status: response.ok === false ? 400 : 200,
        json: async () => response.claims || {},
      }
    }
    return realFetch(url, init)
  }))
}

async function postGoogle(base, body) {
  const res = await realFetch(`${base}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const VALID_CLAIMS = {
  aud: CLIENT_ID,
  iss: 'https://accounts.google.com',
  email: 'Person@gmail.com',
  email_verified: 'true',
  given_name: 'Per',
  family_name: 'Son',
  picture: 'https://lh3.googleusercontent.com/photo',
}

describe('POST /api/auth/google', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GOOGLE_CLIENT_ID
  })

  it('returns 503 when GOOGLE_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    await withServer(makeApp(), async (base) => {
      const { status, body } = await postGoogle(base, { idToken: 'x' })
      expect(status).toBe(503)
      expect(body.error).toMatch(/not configured/i)
    })
  })

  it('rejects when Google does not recognise the token', async () => {
    stubTokeninfo({ ok: false })
    await withServer(makeApp(), async (base) => {
      const { status } = await postGoogle(base, { idToken: 'garbage' })
      expect(status).toBe(401)
    })
  })

  it('rejects tokens issued for a different client (wrong aud)', async () => {
    stubTokeninfo({ claims: { ...VALID_CLAIMS, aud: 'someone-elses-app' } })
    await withServer(makeApp(), async (base) => {
      const { status, body } = await postGoogle(base, { idToken: 'x' })
      expect(status).toBe(401)
      expect(body.error).toMatch(/not issued for this app/i)
    })
  })

  it('rejects unverified Google emails', async () => {
    stubTokeninfo({ claims: { ...VALID_CLAIMS, email_verified: 'false' } })
    await withServer(makeApp(), async (base) => {
      const { status } = await postGoogle(base, { idToken: 'x' })
      expect(status).toBe(401)
    })
  })

  it('creates a new passwordless user on first Google sign-in', async () => {
    stubTokeninfo({ claims: VALID_CLAIMS })
    findUserByEmail.mockResolvedValue(null)
    createUser.mockResolvedValue({
      id: 'u-new',
      email: 'person@gmail.com',
      first_name: 'Per',
      last_name: 'Son',
      profile_image_url: VALID_CLAIMS.picture,
      credits_cents: 500,
    })
    await withServer(makeApp(), async (base) => {
      const { status, body } = await postGoogle(base, { idToken: 'valid-token' })
      expect(status).toBe(200)
      expect(typeof body.token).toBe('string')
      expect(body.user.email).toBe('person@gmail.com')
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'person@gmail.com',
          firstName: 'Per',
          lastName: 'Son',
          passwordHash: null,
          profileImageUrl: VALID_CLAIMS.picture,
        }),
      )
    })
  })

  it('links an existing account by email without creating a user', async () => {
    stubTokeninfo({ claims: VALID_CLAIMS })
    findUserByEmail.mockResolvedValue({
      id: 'u-existing',
      email: 'person@gmail.com',
      first_name: 'Per',
      last_name: 'Son',
      profile_image_url: null,
      credits_cents: 250,
    })
    await withServer(makeApp(), async (base) => {
      const { status, body } = await postGoogle(base, { idToken: 'valid-token' })
      expect(status).toBe(200)
      expect(typeof body.token).toBe('string')
      expect(body.credits.balanceCents).toBe(250)
      expect(createUser).not.toHaveBeenCalled()
    })
  })
})

describe('register guard (no password takeover)', () => {
  it('rejects password registration on a Google-only account', async () => {
    findUserByEmail.mockResolvedValue({
      id: 'u-google-only',
      email: 'person@gmail.com',
      password_hash: null,
    })
    await withServer(makeApp(), async (base) => {
      const res = await realFetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'person@gmail.com', password: 'hunter2' }),
      })
      expect(res.status).toBe(409)
    })
  })
})
