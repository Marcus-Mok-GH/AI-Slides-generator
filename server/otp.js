/**
 * One-time codes for email verification and password reset.
 *
 * A six-digit code has only a million possible values, so codes are stored as
 * an HMAC keyed with a server secret rather than a bare hash: a leaked table
 * then tells an attacker nothing without the key.
 *
 * Codes are single-use, expire in ten minutes, and allow five wrong guesses.
 * A fresh code retires the previous one for the same purpose.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import {
  generateId, createEmailOtp, latestEmailOtpAt, getActiveEmailOtp,
  consumeEmailOtp, incrementEmailOtpAttempts,
} from './db.js'

export const PURPOSE_VERIFY_EMAIL = 'verify_email'
export const PURPOSE_RESET_PASSWORD = 'reset_password'

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_LENGTH = 6

function secret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || 'slideai-dev-secret-change-me'
}

function hashCode({ userId, purpose, code }) {
  return createHmac('sha256', secret())
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex')
}

function hashMatches(a, b) {
  const left = Buffer.from(String(a), 'utf8')
  const right = Buffer.from(String(b), 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, '0')
}

/** Digits only, so "123 456" and "123-456" both work. */
export function normalizeCode(code) {
  return String(code ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH)
}

/**
 * Create and return a new plaintext code for delivery. Returns null when a code
 * was sent moments ago — the caller should tell the user to check their inbox
 * rather than firing another email.
 */
export async function issueOtp({ userId, purpose }) {
  const last = await latestEmailOtpAt(userId, purpose)
  if (last && Date.now() - new Date(last).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return null
  }

  const code = generateCode()
  await createEmailOtp({
    id: await generateId(),
    userId,
    purpose,
    codeHash: hashCode({ userId, purpose, code }),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  })
  return code
}

/**
 * Check a submitted code and consume it on success.
 * Returns { ok: true } or { ok: false, reason } where reason is one of
 * 'format' | 'missing' | 'expired' | 'attempts' | 'mismatch' | 'used'.
 */
export async function checkOtp({ userId, purpose, code }) {
  const clean = normalizeCode(code)
  if (clean.length !== OTP_LENGTH) return { ok: false, reason: 'format' }

  const record = await getActiveEmailOtp(userId, purpose)
  if (!record) return { ok: false, reason: 'missing' }
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'attempts' }
  if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' }

  if (!hashMatches(record.code_hash, hashCode({ userId, purpose, code: clean }))) {
    await incrementEmailOtpAttempts(record.id)
    return { ok: false, reason: 'mismatch' }
  }

  const consumed = await consumeEmailOtp(record.id)
  if (!consumed) return { ok: false, reason: 'used' }
  return { ok: true }
}

/** Human-readable message for a failed check, shown in the form. */
export function otpErrorMessage(reason) {
  switch (reason) {
    case 'format':
      return `Enter the ${OTP_LENGTH}-digit code from the email.`
    case 'expired':
      return 'That code has expired. Send yourself a new one.'
    case 'attempts':
      return 'Too many wrong guesses. Send yourself a new code.'
    case 'missing':
    case 'used':
      return 'That code is no longer valid. Send yourself a new one.'
    default:
      return 'That code is not right. Check the email and try again.'
  }
}
