import { getAccessToken } from './supabase.js'

/**
 * Thrown when the server returns 401 Unauthorized.
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
  const res = await authedGet('/api/auth/user')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return await res.json()
}
