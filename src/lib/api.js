import { getAccessToken, supabase } from './supabase.js'

/**
 * API client. The Supabase session lives in localStorage (managed by
 * supabase-js) and we attach the access token to every request via
 * `Authorization: Bearer …`.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('slideai:unauthorized'))
  }
}

/**
 * Build the headers for an authenticated request, attaching the current
 * Supabase access token if there is one.
 */
async function authHeaders(extra = {}) {
  const token = await getAccessToken()
  const headers = { ...extra }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function postJson(url, body) {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    notifyUnauthorized()
    throw new UnauthorizedError()
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned ${res.status}`)
  }
  if (!res.ok) {
    throw new Error(data?.error || `Server returned ${res.status}`)
  }
  return data
}

async function authedGet(url) {
  const headers = await authHeaders()
  return fetch(url, { headers })
}

export async function generateDeck(payload) {
  const data = await postJson('/api/generate-deck', payload)
  return data.deck
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

export async function generateSlideImage({ prompt, theme, aspectRatio }) {
  const data = await postJson('/api/generate-slide-image', {
    prompt,
    theme,
    aspectRatio,
  })
  return data.image
}

export async function streamGenerateDeck(payload, handlers = {}) {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch('/api/generate-deck/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (res.status === 401) {
    notifyUnauthorized()
    handlers.onError?.('Please sign in to generate decks.')
    return
  }
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
      else if (event === 'slide-image-pending')
        handlers.onSlideImagePending?.(parsed)
      else if (event === 'slide-image') handlers.onSlideImage?.(parsed)
      else if (event === 'slide-image-failed')
        handlers.onSlideImageFailed?.(parsed)
      else if (event === 'done') handlers.onDone?.(parsed.deck)
      else if (event === 'error') {
        handlers.onError?.(parsed.error || 'Failed to generate')
        return
      }
    }
  }
}

export async function listDecks() {
  const res = await authedGet('/api/decks')
  if (res.status === 401) {
    notifyUnauthorized()
    throw new UnauthorizedError()
  }
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.decks
}

export async function loadDeck(id) {
  const res = await authedGet(`/api/decks/${encodeURIComponent(id)}`)
  if (res.status === 401) {
    notifyUnauthorized()
    throw new UnauthorizedError()
  }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const data = await res.json()
  return data.deck
}

export async function saveDeck(deck) {
  const data = await postJson('/api/decks', { deck })
  return data
}

export async function deleteDeck(id) {
  const headers = await authHeaders()
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  })
  if (res.status === 401) {
    notifyUnauthorized()
    throw new UnauthorizedError()
  }
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function renameDeck(id, newTitle) {
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title: newTitle }),
  })
  if (res.status === 401) {
    notifyUnauthorized()
    throw new UnauthorizedError()
  }
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

/**
 * Fetch the currently signed-in user, or `null` if not authenticated.
 */
export async function fetchCurrentUser() {
  const token = await getAccessToken()
  if (!token) return null
  const res = await authedGet('/api/auth/user')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return await res.json()
}

/**
 * Sign in with email + password through our backend proxy. The browser
 * never touches *.supabase.co directly — some networks / extensions
 * block that domain. Once the server returns the session tokens we
 * hand them to supabase-js so the rest of the app behaves as usual.
 */
export async function signInWithPassword({ email, password }) {
  const res = await fetch('/api/auth/password/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Sign-in failed (${res.status})`)
    err.code = data?.code
    err.status = res.status
    throw err
  }
  if (data?.session?.access_token && data.session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  }
  return data
}

/**
 * Sign up with email + password through our backend proxy. Returns
 * `{ session, user, needsConfirmation }` — when email confirmation is
 * required, `session` is null and the caller should prompt the user to
 * check their inbox.
 */
export async function signUpWithPassword({ email, password }) {
  const res = await fetch('/api/auth/password/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Sign-up failed (${res.status})`)
    err.code = data?.code
    err.status = res.status
    throw err
  }
  if (data?.session?.access_token && data.session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  }
  return data
}

/**
 * Send a Supabase password-reset email through our backend proxy.
 * Supabase handles the email templating and the reset link which points to
 * the app's origin.  When the user clicks it they are redirected to
 * <origin>/?resetToken=<token> — the ResetPasswordModal reads that token
 * from the URL on mount and submits the new password directly to Supabase.
 */
export async function resetPasswordEmail(email) {
  const res = await fetch('/api/auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      redirectTo: `${window.location.origin}/`,
    }),
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Reset failed (${res.status})`)
    err.code = data?.code
    err.status = res.status
    throw err
  }
}

export { supabase }
