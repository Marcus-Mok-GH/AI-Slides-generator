/**
 * Single place where the text LLM provider is configured.
 *
 * Provider: Pollinations AI (OpenAI-compatible chat completions).
 * Set POLLINATIONS_API_KEY in the environment. Model and endpoint can be
 * overridden per workload, but every caller defaults to GPT-6 Luna.
 */

const DEFAULT_BASE = 'https://gen.pollinations.ai/v1'
const DEFAULT_MODEL = 'openai/gpt-6-luna'

export const LLM_BASE = (process.env.POLLINATIONS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')

export const DECK_MODEL = process.env.POLLINATIONS_DECK_MODEL || DEFAULT_MODEL
export const SLIDE_MODEL = process.env.POLLINATIONS_SLIDE_MODEL || DEFAULT_MODEL
export const AGENT_MODEL = process.env.POLLINATIONS_AGENT_MODEL || DEFAULT_MODEL

/**
 * API keys are pasted into dashboards by humans, so stray whitespace and
 * newlines inside the value are stripped before it reaches a header.
 */
export function llmKey() {
  return (process.env.POLLINATIONS_API_KEY || '').replace(/\s+/g, '')
}

export function llmHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra }
  const key = llmKey()
  if (!key) {
    throw new Error('POLLINATIONS_API_KEY is not configured — add it to the environment to enable generation')
  }
  headers.Authorization = `Bearer ${key}`
  return headers
}

export function llmUrl(path) {
  return `${LLM_BASE}${path}`
}

/**
 * Turns an upstream HTTP failure into a short, readable Error. The provider
 * nests its message under error.message, so pull that out when it is there.
 */
export function llmError(status, body) {
  let detail = body || ''
  try {
    const parsed = JSON.parse(body)
    detail = parsed?.error?.message || parsed?.error || parsed?.message || body
  } catch {
    // body was not JSON; keep the raw text
  }
  const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return new Error(`pollinations ${status}: ${message.slice(0, 300)}`)
}