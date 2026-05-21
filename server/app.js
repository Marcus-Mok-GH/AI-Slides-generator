import express from 'express'
import { generateDeck, streamGenerateDeck, regenerateSlide, redesignSlide } from './generateDeck.js'
import {
  listDecks, getDeck, saveDeck, deleteDeck, renameDeck, migrate,
  migratePromptHistory, savePromptHistory, getPromptHistory, deletePromptHistoryItem,
  migrateAgentChats, listAgentChats, getAgentChat, createAgentChat, updateAgentChat, deleteAgentChat,
  getCredits, deductCredits, DECK_GENERATION_CENTS,
  migrateGenerationJobs, createGenerationJob, getGenerationJob,
  getPublicStats,
  hasDb, generateId,
} from './db.js'
import { agentFiveTurn, agentFiveStream } from './agentFive.js'
import { buildPptxBuffer } from './exportPptx.js'
import { buildPdfBuffer } from './exportPdf.js'
import { runGenerationJob } from './jobRunner.js'
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js'
import authRouter from './routes/auth.js'

const app = express()
app.use(express.json({ limit: '50mb' }))

// Run schema migrations BEFORE any route registration. On
// Vercel this runs once per cold-start; locally it runs once at boot.
// Wrap each in try/catch so missing DB doesn't crash the function.
async function safeMigrate(fn, name) {
  try {
    await fn()
  } catch (err) {
    console.warn(`[app] ${name} failed (DB likely unavailable):`, err?.message || err)
  }
}

await safeMigrate(migrate, 'migrate')
await safeMigrate(migratePromptHistory, 'migratePromptHistory')
await safeMigrate(migrateAgentChats, 'migrateAgentChats')
await safeMigrate(migrateGenerationJobs, 'migrateGenerationJobs')

function isDbError(err) {
  return err?.statusCode === 503 || /database unavailable/i.test(err?.message)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbConnected: hasDb })
})

/**
 * Public stats — no auth required. Used by the landing page counter.
 * Cached in-process for 60 s to avoid hammering the DB on every page load.
 */
let _statsCache = null
let _statsCacheAt = 0
app.get('/api/stats', async (_req, res) => {
  try {
    const now = Date.now()
    if (!_statsCache || now - _statsCacheAt > 60_000) {
      _statsCache = await getPublicStats()
      _statsCacheAt = now
    }
    res.json(_statsCache)
  } catch (err) {
    console.error('[stats] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable', total: 0, today: 0 })
    }
    res.status(500).json({ error: 'stats unavailable' })
  }
})

// Auth routes — optional auth so register/login work without a token
app.use('/api/auth', optionalAuthMiddleware, authRouter)

// All other /api routes require JWT auth
app.use('/api', authMiddleware)

/**
 * Current user's credit balance plus the per-deck price the client should
 * surface. Used by the TopBar pill and the out-of-credits banner.
 */
app.get('/api/credits', async (req, res) => {
  try {
    const balanceCents = await getCredits(req.user.id)
    res.json({ balanceCents, deckCostCents: DECK_GENERATION_CENTS })
  } catch (err) {
    console.error('[credits] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to load credits' })
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
app.post('/api/export/pptx', async (req, res) => {
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

app.post('/api/export/pdf', async (req, res) => {
  try {
    const { deck } = req.body || {}
    if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
      return res.status(400).json({ error: 'deck.slides is required' })
    }

    const buf = await buildPdfBuffer(deck)

    const safeName = (deck.title || 'deck')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'deck'

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
    res.setHeader('Content-Length', buf.length)
    res.send(buf)
  } catch (err) {
    console.error('[export/pdf] error:', err)
    res.status(500).json({ error: err?.message || 'PDF export failed' })
  }
})

app.post('/api/generate-deck', async (req, res) => {
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

    const balance = await getCredits(req.user.id)
    if (balance < DECK_GENERATION_CENTS) {
      return res.status(402).json({
        error: 'Insufficient credits',
        code: 'insufficient_credits',
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

    const balanceCents = await deductCredits(req.user.id, DECK_GENERATION_CENTS)

    res.json({
      deck,
      balanceCents,
      deckCostCents: DECK_GENERATION_CENTS,
    })
  } catch (err) {
    console.error('[generate-deck] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to generate deck',
    })
  }
})

/* ────────────────── Background generation ────────────────── */

/**
 * POST /api/generate-deck/background
 *
 * Kicks off a generation job that runs entirely server-side, decoupled from
 * the HTTP connection. Returns a jobId immediately; the client can close the
 * tab and reconnect later using the job SSE endpoint to get all events.
 */
app.post('/api/generate-deck/background', async (req, res) => {
  const {
    prompt,
    format    = 'presentation',
    length    = '8 cards',
    tone      = 'Professional',
    language  = 'English',
    mode      = 'default',
    deckId,
    userTheme = null,
  } = req.body || {}

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Missing prompt' })
  }

  const jobId = (typeof deckId === 'string' && deckId.trim()) ? deckId.trim() : (await generateId())
  try {
    const balance = await getCredits(req.user.id)
    if (balance < DECK_GENERATION_CENTS) {
      return res.status(402).json({
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        balanceCents: balance,
        deckCostCents: DECK_GENERATION_CENTS,
      })
    }

    await createGenerationJob(jobId, req.user.id)
    await savePromptHistory(req.user.id, prompt.trim(), format)
  } catch (err) {
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable. Generation jobs require a database.' })
    }
    throw err
  }

  const ctx = {
    prompt: prompt.trim(),
    format, length, tone, language, mode,
    userTheme: userTheme?.primary ? userTheme : null,
    deckId: jobId,
  }

  // Fire off generation WITHOUT awaiting — it runs as a background task
  runGenerationJob(jobId, ctx, req.user.id, await getCredits(req.user.id).catch(() => 0))
    .catch((err) => console.error('[background-gen] unhandled error:', err))

  res.json({ jobId })
})

/**
 * GET /api/generate-deck/job/:jobId   (SSE)
 *
 * Replays every stored event since generation started (catch-up), then
 * streams new events as they arrive until the job completes or fails.
 * Clients that closed the tab can reconnect and receive the full history.
 */
app.get('/api/generate-deck/job/:jobId', async (req, res) => {
  const { jobId } = req.params

  let job
  try {
    job = await getGenerationJob(jobId, req.user.id)
  } catch (e) {
    if (isDbError(e)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    return res.status(500).json({ error: 'DB error' })
  }
  if (!job) return res.status(404).json({ error: 'Job not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  let closed = false
  req.on('close', () => { closed = true })

  // Track how many events we've already sent (used for efficient catch-up)
  let cursor = 0
  const flush = (events) => {
    for (let i = cursor; i < events.length; i++) {
      if (closed) return
      const { event, data } = events[i]
      send(event, data)
    }
    cursor = events.length
  }

  // Replay all events accumulated so far
  flush(job.events || [])

  if (job.status === 'completed' || job.status === 'failed') {
    return res.end()
  }

  // Keep-alive ping so proxies don't time out during long generations
  const ping = setInterval(() => { if (!closed) res.write(': ping\n\n') }, 15000)

  const poll = async () => {
    if (closed) { clearInterval(ping); return }
    try {
      const updated = await getGenerationJob(jobId, req.user.id)
      if (!updated) { clearInterval(ping); return res.end() }

      flush(updated.events || [])

      if (updated.status === 'completed' || updated.status === 'failed') {
        clearInterval(ping)
        return res.end()
      }
    } catch (e) {
      if (isDbError(e)) {
        clearInterval(ping)
        send('error', { error: 'Database unavailable' })
        return res.end()
      }
      console.error('[job-sse] poll error:', e?.message)
    }

    if (!closed) setTimeout(poll, 500)
  }

  setTimeout(poll, 500)
})

/* ─────────────────────────────────────────────────────────── */

app.post('/api/generate-deck/stream', async (req, res) => {
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

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // periodic comment to keep proxies from buffering
  const ping = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => clearInterval(ping))

  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      send('error', { error: 'Missing "prompt"' })
      return res.end()
    }

    const balance = await getCredits(req.user.id)
    if (balance < DECK_GENERATION_CENTS) {
      send('error', {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        balanceCents: balance,
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
      const saved = await saveDeck(deck, req.user.id)
      deck.id = saved.id
      deck.updatedAt = saved.updatedAt
    } catch (e) {
      if (isDbError(e)) {
        send('warning', { message: 'Database unavailable — deck not persisted' })
      } else {
        console.warn('[stream] failed to persist deck:', e?.message)
      }
    }

    let balanceCents = balance
    try {
      balanceCents = await deductCredits(req.user.id, DECK_GENERATION_CENTS)
      await savePromptHistory(req.user.id, prompt.trim(), format)
      send('credits', { balanceCents, deckCostCents: DECK_GENERATION_CENTS })
    } catch (e) {
      console.warn('[stream] credit deduction failed:', e?.message)
    }

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

app.get('/api/prompt-history', async (req, res) => {
  try {
    const history = await getPromptHistory(req.user.id)
    res.json({ history })
  } catch (err) {
    console.error('[prompt-history] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable', history: [] })
    }
    res.status(500).json({ error: 'Failed to load prompt history' })
  }
})

app.delete('/api/prompt-history/:id', async (req, res) => {
  try {
    await deletePromptHistoryItem(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[prompt-history delete] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to delete prompt history item' })
  }
})

app.get('/api/decks', async (req, res) => {
  try {
    const decks = await listDecks(req.user.id)
    res.json({ decks })
  } catch (err) {
    console.error('[list decks] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable', decks: [] })
    }
    res.status(500).json({ error: err?.message || 'Failed to list decks' })
  }
})

app.get('/api/decks/:id', async (req, res) => {
  try {
    const deck = await getDeck(req.params.id, req.user.id)
    if (!deck) return res.status(404).json({ error: 'Deck not found' })
    res.json({ deck })
  } catch (err) {
    console.error('[get deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: err?.message || 'Failed to load deck' })
  }
})

app.post('/api/decks', async (req, res) => {
  try {
    const { deck } = req.body || {}
    if (!deck || !Array.isArray(deck.slides)) {
      return res.status(400).json({ error: 'Missing or invalid deck' })
    }
    const result = await saveDeck(deck, req.user.id)
    res.json({ id: result.id, updatedAt: result.updatedAt })
  } catch (err) {
    console.error('[save deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: err?.message || 'Failed to save deck' })
  }
})

app.patch('/api/decks/:id', async (req, res) => {
  try {
    const { title } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
    await renameDeck(req.params.id, req.user.id, title.trim())
    res.json({ ok: true })
  } catch (err) {
    console.error('[rename deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: err?.message || 'Failed to rename deck' })
  }
})

app.delete('/api/decks/:id', async (req, res) => {
  try {
    await deleteDeck(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[delete deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
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
app.post('/api/fetch-url', async (req, res) => {
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
        .replace(/<noscript[\s\S]*?<\/script>/gi, ' ')
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

app.post('/api/regenerate-slide', async (req, res) => {
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

app.post('/api/agentfive/chat', async (req, res) => {
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

app.post('/api/agentfive/stream', async (req, res) => {
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

app.get('/api/agentfive/chats', async (req, res) => {
  try {
    const chats = await listAgentChats(req.user.id)
    res.json({ chats })
  } catch (err) {
    console.error('[agentfive/chats list]', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable', chats: [] })
    }
    res.status(500).json({ error: 'Failed to list chats' })
  }
})

app.post('/api/agentfive/chats', async (req, res) => {
  try {
    const { title = 'New chat', messages = [] } = req.body || {}
    const id = await createAgentChat(req.user.id, title, messages)
    res.json({ id })
  } catch (err) {
    console.error('[agentfive/chats create]', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to create chat' })
  }
})

app.get('/api/agentfive/chats/:id', async (req, res) => {
  try {
    const chat = await getAgentChat(req.params.id, req.user.id)
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ chat })
  } catch (err) {
    console.error('[agentfive/chats get]', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to get chat' })
  }
})

app.put('/api/agentfive/chats/:id', async (req, res) => {
  try {
    const { title, messages } = req.body || {}
    await updateAgentChat(req.params.id, req.user.id, { title, messages })
    res.json({ ok: true })
  } catch (err) {
    console.error('[agentfive/chats update]', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to update chat' })
  }
})

app.delete('/api/agentfive/chats/:id', async (req, res) => {
  try {
    await deleteAgentChat(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[agentfive/chats delete]', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to delete chat' })
  }
})

app.post('/api/redesign-slide', async (req, res) => {
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
