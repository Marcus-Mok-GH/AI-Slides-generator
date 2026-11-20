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

/**
 * Whether a session token is stored. A visitor without one has no session to
 * restore, so nothing about them depends on a round trip to /api/auth/me.
 */
export function hasStoredToken() {
  try {
    return Boolean(localStorage.getItem('slideai:token'))
  } catch {
    return false
  }
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

/**
 * Plan mode, step 1: the questions worth answering before the outline is
 * drafted. Resolves to an array of `{ id, question, why, suggestions }`.
 */
export async function suggestPlanQuestions({ prompt, length, tone }) {
  const data = await postJson('/api/plan/questions', { prompt, length, tone })
  return data.questions || []
}

/**
 * Plan mode, step 2: the slide-by-slide outline the user edits and approves.
 * The approved object is passed back to generation as `plan`.
 */
export async function planDeck({ prompt, answers = [], spec = {} }) {
  const data = await postJson('/api/plan', { prompt, answers, spec })
  return data.plan
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

/**
 * The job endpoint pings every 15 seconds, so a longer silence means the
 * connection is gone rather than the model being slow.
 */
const JOB_SILENCE_MS = 45000

/** Backoff between reconnects to a dropped job stream. */
const JOB_RECONNECT_DELAYS_MS = [800, 1600, 3200]

/**
 * `reader.read()` that gives up when the server goes quiet, so a connection
 * that never closes but never sends anything cannot hang the viewer forever.
 */
async function readWithSilence(reader) {
  let timer
  const silent = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Job stream went quiet')),
      JOB_SILENCE_MS,
    )
  })
  try {
    return await Promise.race([reader.read(), silent])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One connection to the job stream, from first byte to close. Resolves with
 * `terminal: true` only when the server said the job was done or failed;
 * anything else means the stream was cut and the deck is still unfinished.
 */
async function readJobStream(jobId, handlers) {
  let res
  try {
    res = await fetch(`/api/generate-deck/job/${encodeURIComponent(jobId)}`, {
      headers: getAuthHeaders(),
    })
  } catch {
    return { terminal: false, message: 'Could not reach the server.' }
  }
  if (res.status === 404) {
    handlers.onError?.('Job not found — it may have expired.')
    return { terminal: true }
  }
  if (!res.ok || !res.body) {
    return { terminal: false, message: `Could not connect to job (${res.status})` }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let terminal = false

  try {
    while (!terminal) {
      const { value, done } = await readWithSilence(reader)
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while (!terminal && (idx = buf.indexOf('\n\n')) >= 0) {
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
        else if (event === 'done') {
          terminal = true
          handlers.onDone?.(parsed.deck)
        } else if (event === 'error') {
          terminal = true
          handlers.onError?.(parsed.error || 'Failed to generate', parsed)
        }
      }
    }
  } catch {
    // Connection died mid-stream (network change, sleeping tab, proxy
    // timeout). The caller reconnects; the job is still running server-side.
  } finally {
    try { reader.cancel() } catch { /* already closed */ }
  }

  return { terminal }
}

/**
 * Follow a generation job to its end.
 *
 * A stream can die before the deck does: a phone switching networks, a laptop
 * asleep, a proxy closing an idle connection. Ending the read quietly used to
 * leave the viewer on "Drafting slide 3 of 8" forever, with no error and
 * nothing to click — the visitor waits, then leaves.
 *
 * The job runs server-side and the endpoint replays its whole event history,
 * so reconnecting loses nothing: slides that landed while we were away arrive
 * on the replay, and a deck that finished in the meantime arrives complete.
 * Only when every attempt fails does the visitor get an error — and the app
 * hands their brief back with a one-click retry.
 */
export async function connectToJob(jobId, handlers = {}) {
  let message = ''

  for (let attempt = 0; attempt <= JOB_RECONNECT_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, JOB_RECONNECT_DELAYS_MS[attempt - 1]),
      )
    }
    const result = await readJobStream(jobId, handlers)
    if (result.terminal) return
    message = result.message || message
  }

  handlers.onError?.(
    message || 'The connection dropped before your deck finished building.',
  )
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
 * Public gallery: decks whose owners opted them in. No auth header, no
 * session — this is what the landing page shows to visitors.
 */
export async function loadGalleryDecks() {
  const res = await fetch('/api/gallery')
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.decks || []
}

/** List (or delist) one of your own decks in the public gallery. */
export async function setDeckPublic(id, isPublic) {
  return postJson(`/api/decks/${encodeURIComponent(id)}/publish`, {
    public: Boolean(isPublic),
  })
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
