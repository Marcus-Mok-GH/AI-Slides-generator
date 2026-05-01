import express from 'express'
import { generateDeck, streamGenerateDeck, regenerateSlide, redesignSlide } from './generateDeck.js'
import {
  listDecks, getDeck, saveDeck, deleteDeck, renameDeck, migrate,
  migratePromptHistory, savePromptHistory, getPromptHistory, deletePromptHistoryItem,
  migrateAgentChats, listAgentChats, getAgentChat, createAgentChat, updateAgentChat, deleteAgentChat,
  getCredits, deductCredits, DECK_GENERATION_CENTS,
} from './db.js'
import { setupAuth, isAuthenticated, currentUserId } from './auth.js'
import { agentFiveTurn, agentFiveStream } from './agentFive.js'
import { buildPptxBuffer } from './exportPptx.js'

const app = express()
app.use(express.json({ limit: '50mb' }))

// Run schema migrations and wire auth BEFORE any route registration. On
// Vercel this runs once per cold-start; locally it runs once at boot.
await migrate()
await migratePromptHistory()
await migrateAgentChats()
await setupAuth(app)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: !!process.env.LLM7_API_KEY })
})

/**
 * Current user's credit balance plus the per-deck price the client should
 * surface. Used by the TopBar pill and the out-of-credits banner.
 */
app.get('/api/credits', isAuthenticated, async (req, res) => {
  try {
    const balanceCents = await getCredits(currentUserId(req))
    res.json({ balanceCents, deckCostCents: DECK_GENERATION_CENTS })
  } catch (err) {
    console.error('[credits] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to load credits' })
  }
})

/**
 * Server-side PPTX export.
 *
 * The browser sends the deck JSON; we use pptxgenjs to build a proper
 * .pptx file and stream it back as an attachment. This avoids all the
 * html2canvas / iframe / browser-sandbox issues that plague client-side
 * export in Replit's nested-iframe preview environment.
 *
 * Each slide gets:
 *   - A full-bleed background image (the data-URL already stored in the
 *     deck — no extra network call needed).
 *   - A fallback solid-colour background for slides without an image.
 *   - Speaker notes when present.
 */
app.post('/api/export/pptx', isAuthenticated, async (req, res) => {
  try {
    const { deck } = req.body || {}
    if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
      return res.status(400).json({ error: 'deck.slides is required' })
    }

    const buf = await buildPptxBuffer(deck)

    const safeName = (deck.title || 'deck')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'deck'

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pptx"`)
    res.setHeader('Content-Length', buf.length)
    res.send(buf)
  } catch (err) {
    console.error('[export/pptx] error:', err)
    res.status(500).json({ error: err?.message || 'PPTX export failed' })
  }
})

app.post('/api/generate-deck', isAuthenticated, async (req, res) => {
  try {
    const {
      prompt,
      format = 'presentation',
      length = '8 cards',
      tone = 'Professional',
      language = 'English',
      mode = 'default',
    } = req.body || {}

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing "prompt"' })
    }

    const userId = currentUserId(req)
    const balance = await getCredits(userId)
    if (balance < DECK_GENERATION_CENTS) {
      return res.status(402).json({
        error: 'Out of credits',
        balanceCents: balance,
        deckCostCents: DECK_GENERATION_CENTS,
      })
    }

    const deck = await generateDeck({
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
      mode,
    })

    const newBalance = await deductCredits(userId, DECK_GENERATION_CENTS)
    res.json({ deck, balanceCents: newBalance ?? balance })
  } catch (err) {
    console.error('[generate-deck] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to generate deck',
    })
  }
})

app.post('/api/generate-deck/stream', isAuthenticated, async (req, res) => {
  const {
    prompt,
    format = 'presentation',
    length = '8 cards',
    tone = 'Professional',
    language = 'English',
    mode = 'default',
    deckId,
    userTheme = null,
  } = req.body || {}

  const userId = currentUserId(req)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Save this prompt to history (fire-and-forget — don't block the stream)
  if (userId && prompt?.trim()) {
    savePromptHistory(userId, prompt.trim(), format).catch(() => {})
  }

  // periodic comment to keep proxies from buffering
  const ping = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => clearInterval(ping))

  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      send('error', { error: 'Missing "prompt"' })
      return res.end()
    }

    // Credit pre-check. We block here (rather than mid-stream) so the user
    // sees the out-of-credits banner instead of a half-generated deck.
    const startBalance = await getCredits(userId)
    if (startBalance < DECK_GENERATION_CENTS) {
      send('error', {
        error: 'Out of credits',
        code: 'insufficient_credits',
        balanceCents: startBalance,
        deckCostCents: DECK_GENERATION_CENTS,
      })
      return res.end()
    }

    const ctx = {
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
      mode,
      userTheme: userTheme && userTheme.primary ? userTheme : null,
    }

    const deck = await streamGenerateDeck(ctx, {
      onThinking: ({ text, type }) => {
        send('thinking', { text, type })
      },
      onMeta: (meta) => {
        send('meta', meta)
      },
      onPartial: ({ index, partial }) => send('partial', { index, partial }),
      onSlide: ({ slide, index }) => {
        send('slide', { slide, index })
      },
    })

    // If the user chose a preset theme, override the AI-generated theme so
    // the persisted deck (and the finalDeck sent to the client) use the
    // correct colors consistently.
    if (userTheme && userTheme.primary) {
      deck.theme = { ...deck.theme, ...userTheme }
    }

    // Persist the finished deck so it shows up in Recent decks immediately.
    // If the client provided a deckId up front, reuse it so the URL the user
    // already navigated to (/slide/{deckId}) keeps working without a swap.
    if (typeof deckId === 'string' && deckId.trim()) {
      deck.id = deckId.trim()
    }
    try {
      const saved = await saveDeck(deck, userId)
      deck.id = saved.id
      deck.updatedAt = saved.updatedAt
    } catch (e) {
      console.warn('[stream] failed to persist deck:', e?.message)
    }

    // Charge for the deck only after it's been generated AND persisted.
    // If the deduction returns null (race / concurrent spend) we fall back
    // to whatever the DB says now so the UI doesn't show a stale balance.
    let balanceCents = startBalance
    try {
      const after = await deductCredits(userId, DECK_GENERATION_CENTS)
      balanceCents = after ?? (await getCredits(userId))
    } catch (e) {
      console.warn('[stream] credit deduction failed:', e?.message)
    }
    send('credits', { balanceCents, deckCostCents: DECK_GENERATION_CENTS })

    send('done', { deck })
    res.end()
  } catch (err) {
    console.error('[generate-deck/stream] error:', err)
    send('error', { error: err?.message || 'Failed to generate deck' })
    res.end()
  } finally {
    clearInterval(ping)
  }
})

/* ---------------- Prompt history routes ---------------- */

app.get('/api/prompt-history', isAuthenticated, async (req, res) => {
  try {
    const history = await getPromptHistory(currentUserId(req))
    res.json({ history })
  } catch (err) {
    console.error('[prompt-history] GET error:', err)
    res.status(500).json({ error: err?.message || 'Failed to load history' })
  }
})

app.delete('/api/prompt-history/:id', isAuthenticated, async (req, res) => {
  try {
    await deletePromptHistoryItem(Number(req.params.id), currentUserId(req))
    res.json({ ok: true })
  } catch (err) {
    console.error('[prompt-history] DELETE error:', err)
    res.status(500).json({ error: err?.message || 'Failed to delete item' })
  }
})

app.get('/api/decks', isAuthenticated, async (req, res) => {
  try {
    const decks = await listDecks(currentUserId(req))
    res.json({ decks })
  } catch (err) {
    console.error('[list decks] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to list decks' })
  }
})

app.get('/api/decks/:id', isAuthenticated, async (req, res) => {
  try {
    const deck = await getDeck(req.params.id, currentUserId(req))
    if (!deck) return res.status(404).json({ error: 'Deck not found' })
    res.json({ deck })
  } catch (err) {
    console.error('[get deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to load deck' })
  }
})

app.post('/api/decks', isAuthenticated, async (req, res) => {
  try {
    const { deck } = req.body || {}
    if (!deck || !Array.isArray(deck.slides)) {
      return res.status(400).json({ error: 'Missing or invalid deck' })
    }
    const result = await saveDeck(deck, currentUserId(req))
    res.json({ id: result.id, updatedAt: result.updatedAt })
  } catch (err) {
    console.error('[save deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to save deck' })
  }
})

app.patch('/api/decks/:id', isAuthenticated, async (req, res) => {
  try {
    const { title } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
    await renameDeck(req.params.id, currentUserId(req), title.trim())
    res.json({ ok: true })
  } catch (err) {
    console.error('[rename deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to rename deck' })
  }
})

app.delete('/api/decks/:id', isAuthenticated, async (req, res) => {
  try {
    await deleteDeck(req.params.id, currentUserId(req))
    res.json({ ok: true })
  } catch (err) {
    console.error('[delete deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to delete deck' })
  }
})

/**
 * Fetch a public URL and return a plain-text excerpt the user can drop
 * into the deck prompt. Used by the "From URL" chip on the Create page.
 *
 * Body: { url }
 * Response: { url, title, text }
 */
app.post('/api/fetch-url', isAuthenticated, async (req, res) => {
  try {
    const { url } = req.body || {}
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res
        .status(400)
        .json({ error: 'Provide a full http(s):// URL' })
    }
    const upstream = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SlideAI/1.0; +https://replit.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Avoid hanging the server forever on huge resources.
      signal: AbortSignal.timeout(15_000),
    })
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Upstream returned ${upstream.status}` })
    }
    const html = await upstream.text()
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''
    const text = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<header[\s\S]*?<\/header>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
    res.json({ url, title, text })
  } catch (err) {
    console.error('[fetch-url] error:', err)
    res.status(500).json({
      error: err?.name === 'TimeoutError'
        ? 'Request timed out'
        : err?.message || 'Failed to fetch URL',
    })
  }
})

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
}

app.post('/api/regenerate-slide', isAuthenticated, async (req, res) => {
  try {
    const { deck, slideIndex, instruction } = req.body || {}
    const slide = await regenerateSlide({
      deck,
      slideIndex: Number(slideIndex),
      instruction: typeof instruction === 'string' ? instruction.trim() : '',
    })
    res.json({ slide })
  } catch (err) {
    console.error('[regenerate-slide] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to regenerate slide',
    })
  }
})

/* ---------------- Agent Five ---------------- */

app.post('/api/agentfive/chat', isAuthenticated, async (req, res) => {
  try {
    const { history = [], message = '' } = req.body || {}
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Missing "message"' })
    }
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: '"history" must be an array' })
    }
    const turn = await agentFiveTurn({
      history,
      userMessage: message,
    })
    res.json({
      reply: turn.reply,
      needsClarification: turn.needsClarification,
      toolResults: turn.toolResults,
    })
  } catch (err) {
    console.error('[agentfive] error:', err)
    res
      .status(500)
      .json({ error: err?.message || 'Agent Five failed' })
  }
})

app.post('/api/agentfive/stream', isAuthenticated, async (req, res) => {
  const { history = [], message = '' } = req.body || {}
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing "message"' })
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: '"history" must be an array' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const ping = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => clearInterval(ping))

  try {
    await agentFiveStream({ history, userMessage: message.trim() }, send)
  } catch (err) {
    console.error('[agentfive/stream] error:', err)
    send('error', { error: err?.message || 'Agent Five failed' })
  } finally {
    clearInterval(ping)
    res.end()
  }
})

/* ---------------- Agent Five Chats CRUD ---------------- */

app.get('/api/agentfive/chats', isAuthenticated, async (req, res) => {
  try {
    const userId = await currentUserId(req)
    const chats = await listAgentChats(userId)
    res.json({ chats })
  } catch (err) {
    console.error('[agentfive/chats list]', err)
    res.status(500).json({ error: 'Failed to list chats' })
  }
})

app.post('/api/agentfive/chats', isAuthenticated, async (req, res) => {
  try {
    const userId = await currentUserId(req)
    const { title = 'New chat', messages = [] } = req.body || {}
    const id = await createAgentChat(userId, title, messages)
    res.json({ id })
  } catch (err) {
    console.error('[agentfive/chats create]', err)
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

app.get('/api/agentfive/chats/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = await currentUserId(req)
    const chat = await getAgentChat(req.params.id, userId)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ chat })
  } catch (err) {
    console.error('[agentfive/chats get]', err)
    res.status(500).json({ error: 'Failed to get chat' })
  }
})

app.put('/api/agentfive/chats/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = await currentUserId(req)
    const { title, messages } = req.body || {}
    await updateAgentChat(req.params.id, userId, { title, messages })
    res.json({ ok: true })
  } catch (err) {
    console.error('[agentfive/chats update]', err)
    res.status(500).json({ error: 'Failed to update chat' })
  }
})

app.delete('/api/agentfive/chats/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = await currentUserId(req)
    await deleteAgentChat(req.params.id, userId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[agentfive/chats delete]', err)
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

app.post('/api/redesign-slide', isAuthenticated, async (req, res) => {
  try {
    const { deck, slideIndex, instruction } = req.body || {}
    const slide = await redesignSlide({
      deck,
      slideIndex: Number(slideIndex),
      instruction: typeof instruction === 'string' ? instruction.trim() : '',
    })
    res.json({ slide })
  } catch (err) {
    console.error('[redesign-slide] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to redesign slide',
    })
  }
})

export default app
