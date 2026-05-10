/**
 * API client. Browser requests rely on Vercel Deployment Protection; the
 * backend reads VDP/OIDC headers and returns the current user from /auth/me.
 */

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

async function get(url) {
  return fetch(url)
}

async function getJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('slideai:unauthorized'))
    throw new UnauthorizedError(data?.error || 'Unauthorized')
  }
  if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`)
  return data
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

export async function startBackgroundDeck(payload) {
  const res = await fetch('/api/generate-deck/background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`/api/generate-deck/job/${encodeURIComponent(jobId)}`)
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
    headers: { 'Content-Type': 'application/json' },
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

export async function saveDeck(deck) {
  const data = await postJson('/api/decks', { deck })
  return data
}

export async function deleteDeck(id) {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function renameDeck(id, newTitle) {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch('/api/agentfive/chats')
  const data = await res.json()
  return data.chats || []
}

export async function createAgentChat({ title, messages = [] } = {}) {
  const data = await postJson('/api/agentfive/chats', { title, messages })
  return data.id
}

export async function getAgentChat(id) {
  const res = await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  const data = await res.json()
  return data.chat || null
}

export async function updateAgentChat(id, { title, messages } = {}) {
  const res = await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, messages }),
  })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return true
}

export async function deleteAgentChat(id) {
  await fetch(`/api/agentfive/chats/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function streamAgentFive({ history, message }, handlers = {}) {
  const res = await fetch('/api/agentfive/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
