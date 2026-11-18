/**
 * Tests for the visitor-safe generation error copy.
 *
 * Covers:
 *  - upstream provider errors (rate limit, auth, network) map to calm copy
 *  - the "pollinations <status>" message shape llmError() produces
 *  - errors already worded for the visitor pass through untouched
 *  - unknown failures get the generic fallback, never raw provider text
 */

import { describe, it, expect } from 'vitest'
import { visitorErrorMessage } from '../server/errorCopy.js'

describe('visitorErrorMessage', () => {
  it('maps rate-limit errors by message text', () => {
    const out = visitorErrorMessage(new Error('pollinations 429: rate limit exceeded'))
    expect(out).toMatch(/a lot of requests/i)
    expect(out).toMatch(/haven’t been charged/i)
    expect(out).not.toMatch(/pollinations/i)
  })

  it('maps rate-limit errors by status property', () => {
    const err = new Error('slow down')
    err.statusCode = 429
    expect(visitorErrorMessage(err)).toMatch(/a lot of requests/i)
  })

  it('maps missing-key and auth errors to the unavailable copy', () => {
    const out = visitorErrorMessage(
      new Error('POLLINATIONS_API_KEY is not configured — add it to the environment to enable generation'),
    )
    expect(out).toMatch(/temporarily unavailable|briefly unavailable/i)
    expect(out).not.toMatch(/POLLINATIONS|API_KEY|environment/i)
  })

  it('maps network failures to the connection copy', () => {
    const out = visitorErrorMessage(new Error('fetch failed'))
    expect(out).toMatch(/connection/i)
  })

  it('gives unknown failures the generic copy without provider detail', () => {
    const out = visitorErrorMessage(new Error('Failed to parse model JSON: Unexpected token'))
    expect(out).toMatch(/something went wrong/i)
    expect(out).not.toMatch(/JSON|token/i)
  })

  it('passes visitor-safe errors through untouched', () => {
    const err = new Error('Could not apply that edit (model returned neither "ops" nor "html"). Try rephrasing the instruction.')
    err.visitorSafe = true
    expect(visitorErrorMessage(err)).toBe(err.message)
  })

  it('handles a null error without throwing', () => {
    expect(typeof visitorErrorMessage(null)).toBe('string')
  })
})
