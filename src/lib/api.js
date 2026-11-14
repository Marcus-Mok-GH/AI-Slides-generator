/**
 * API client. All requests include the JWT token from localStorage.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

export function getAuthHeaders() {
  const token = localStorage.getItem('slideai:token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned ${res.status}`)
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Server returned ${res.status}`)
    // Callers branch on the server's code (e.g. email_unverified) without
    // having to match on message text.
    err.status = res.status
    err.code = data?.code
    throw err
  }
  return data
}

async function get(url) {
  return fetch(url, { headers: getAuthHeaders() })
}

async function getJson(url) {
  const res = await fetch(url, { headers: getAuthHeaders() })
  const data = await res.json().catch(() => null)
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('slideai:unauthorized'))
    throw new UnauthorizedError(data?.error || 'Unauthorized')
  }
  if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`)
  return data
}

export async function login({ email, password }) {
  const data = await postJson('/api/auth/login', { email, password })
  if (data.token) {
    localStorage.setItem('slideai:token', data.token)
  }
  return data
}

export async function loginWithGoogle(idToken) {
  const data = await postJson('/api/auth/google', { idToken })
  if (data.token) {
    localStorage.setItem('slideai:token', data.token)
  }
  return data
}

/**
 * Ask the server to email a one-time reset code. Resolves even when no account
 * matches (the endpoint deliberately does not reveal which emails exist).
 */
export async function requestPasswordReset(email) {
  return postJson('/api/auth/forgot-password', { email })
}

/**
 * Exchange an emailed code + new password for a session. Returns
 * `{ verificationRequired: true }` when the account also needs email verification.
 */
export async function resetPassword({ email, code, password }) {
  const data = await postJson('/api/auth/reset-password', { email, code, password })
  if (data.token) {
    localStorage.setItem('slideai:token', data.token)
  }
  return data
}

/** Confirm a signup email with its 6-digit code; signs the user in on success. */
export async function verifyEmail({ email, code }) {
  const data = await postJson('/api/auth/verify-email', { email, code })
  if (data.token) {
    localStorage.setItem('slideai:token', data.token)
  }
  return data
}

/** Send a fresh signup verification code. */
export async function resendVerificationCode(email) {
  return postJson('/api/auth/resend-verification', { email })
}

export async function register({ email, password, firstName, lastName }) {
  const data = await postJson('/api/auth/register', { email, password, firstName, lastName })
  if (data.token) {
    localStorage.setItem('slideai:token', data.token)
  }
  return data
}

export function logout() {
  localStorage.removeItem('slideai:token')
}

export async function generateDeck(payload) {
  const data = await postJson('/api/generate-deck', payload)
  return data.deck
}

export async function editSlide({ deck, slideIndex, instruction }) {
  const data = await postJson('/api/edit-slide', {
    deck,
    slideIndex,
    instruction,
  })
  return data.slide
}

export async function regenerateSlide({ deck, slideIndex, instruction }) {
  const data = await postJson('/api/regenerate-slide', {
    deck,
    slideIndex,
    instruction,
  })
  return data.slide
}

export async function redesignSlide({ deck, slideIndex, instruction }) {
  const data = await postJson('/api/redesign-slide', {
    deck,
    slideIndex,
    instruction,
  })
  return data.slide
}

export async function startBackgroundDeck(payload) {
  const res = await fetch('/api/generate-deck/background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  if (res.status === 402) {
    const data = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(data.error || 'Out of credits'),
      { code: data.code, balanceCents: data.balanceCents, deckCostCents: data.deckCostCents },
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Server returned ${res.status}`)
  }
  const { jobId } = await res.json()
  return jobId
}

export async function connectToJob(jobId, handlers = {}) {
  const res = await fetch(`/api/generate-deck/job/${encodeURIComponent(jobId)}`, {
    headers: getAuthHeaders(),
  })
  if (res.status === 404) {
    handlers.onError?.('Job not found — it may have expired.')
    return
  }
  if (!res.ok || !res.body) {
    handlers.onError?.(`Could not connect to job (${res.status})`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed
      try { parsed = JSON.parse(data) } catch { continue }
      if (event === 'thinking') handlers.onThinking?.(parsed)
      else if (event === 'meta') handlers.onMeta?.(parsed)
      else if (event === 'partial') handlers.onPartial?.(parsed)
      else if (event === 'slide') handlers.onSlide?.(parsed)
      else if (event === 'credits') handlers.onCredits?.(parsed)
      else if (event === 'done') handlers.onDone?.(parsed.deck)
      else if (event === 'error') {
        handlers.onError?.(parsed.error || 'Failed to generate', parsed)
        return
      }
    }
  }
}

export async function streamGenerateDeck(payload, handlers = {}) {
  const res = await fetch('/api/generate-deck/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Server returned ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (event === 'thinking') handlers.onThinking?.(parsed)
      else if (event === 'meta') handlers.onMeta?.(parsed)
      else if (event === 'partial') handlers.onPartial?.(parsed)
      else if (event === 'slide') handlers.onSlide?.(parsed)
      else if (event === 'credits') handlers.onCredits?.(parsed)
      else if (event === 'done') handlers.onDone?.(parsed.deck)
      else if (event === 'error') {
        handlers.onError?.(parsed.error || 'Failed to generate', parsed)
        return
      }
    }
  }
}

export async function listDecks() {
  const res = await get('/api/decks')
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.decks
}

export async function loadDeck(id) {
  const res = await get(`/api/decks/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.deck
}

/**
 * Public deck fetch for shared links. Deliberately sends no auth header: the
 * link has to work for someone who has never signed in.
 */
export async function loadSharedDeck(id) {
  const res = await fetch(`/api/shared/decks/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.deck
}

/**
 * Copy a shared deck into the signed-in user's account. Used by the deck a
 * share-link visitor asked for before they had to sign in.
 */
export async function copySharedDeck(id) {
  const data = await postJson(
    `/api/shared/decks/${encodeURIComponent(id)}/copy`,
    {},
  )
  return data.deck
}

export async function saveDeck(deck) {
  const data = await postJson('/api/decks', { deck })
  return data
}

export async function deleteDeck(id) {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function renameDeck(id, newTitle) {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ title: newTitle }),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function loadDecks() {
  const res = await get('/api/decks')
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.decks
}

export async function fetchCurrentUser() {
  return getJson('/api/auth/me')
}

export async function fetchCredits() {
  return getJson('/api/credits')
}

export async function agentFiveChat({ history, message }) {
  const data = await postJson('/api/agentfive/chat', { history, message })
  return data
}

export async function listAgentChats() {
  const res = await fetch('/api/agentfive/chats', { headers: getAuthHeaders() })
  const data = await res.json()
  return data.chats || []
}

export async function createAgentChat({ title, messages = [] } = {}) {
  const data = await postJson('/api/agentfive/chats', { title, messages })
  return data.id
}

export async function getAgentChat(id) {
  const res = await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
  })
  if (res.status === 404) return null
  const data = await res.json()
  return data.chat || null
}

export async function updateAgentChat(id, { title, messages } = {}) {
  const res = await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ title, messages }),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function deleteAgentChat(id) {
  await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
}

export async function streamAgentFive({ history, message }, handlers = {}) {
  const res = await fetch('/api/agentfive/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ history, message }),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Server returned ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed
      try { parsed = JSON.parse(data) } catch { continue }
      if (event === 'token_delta') handlers.onTokenDelta?.(parsed)
      else if (event === 'reply_delta') handlers.onReplyDelta?.(parsed)
      else if (event === 'tool_start') handlers.onToolStart?.(parsed)
      else if (event === 'tool_result') handlers.onToolResult?.(parsed)
      else if (event === 'done') handlers.onDone?.(parsed)
      else if (event === 'error') handlers.onError?.(parsed.error || 'Agent Five failed')
    }
  }
}
