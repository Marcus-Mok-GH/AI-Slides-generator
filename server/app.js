import express from 'express'
import { generateDeck, streamGenerateDeck, regenerateSlide, redesignSlide, editSlide } from './generateDeck.js'
import {
  listDecks, getDeck, getDeckById, saveDeck, deleteDeck, renameDeck, migrate,
  migratePromptHistory, savePromptHistory, getPromptHistory, deletePromptHistoryItem,
  migrateAgentChats, listAgentChats, getAgentChat, createAgentChat, updateAgentChat, deleteAgentChat,
  getCredits, deductCredits,
  migrateGenerationJobs, createGenerationJob, getGenerationJob,
  getPublicStats,
  hasDb, generateId,
} from './db.js'
import { agentFiveTurn, agentFiveStream } from './agentFive.js'
import { buildPptxBuffer } from './exportPptx.js'
import { buildPdfBuffer } from './exportPdf.js'
import { slugify } from '../src/lib/deckName.js'
import { runGenerationJob } from './jobRunner.js'
import { BASE_DECK_CENTS, deckCostCents } from '../src/lib/pricing.js'
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js'
import authRouter from './routes/auth.js'
import { isEmailConfigured } from './mailer.js'

const app = express()
app.use(express.json({ limit: '50mb' }))

// Every request waits for schema setup to settle (cached after the first run).
app.use((_req, _res, next) => {
  ensureSchema().then(() => next(), () => next())
})

// Schema setup happens lazily on the first request, NOT at module load.
//
// Top-level `await` in a serverless entrypoint is its own failure mode: if the
// first migration hangs or throws while the module is still evaluating, the
// function never becomes invocable and every route returns a bare 500. Running
// it lazily keeps module evaluation synchronous, and each step is wrapped so a
// missing or broken database degrades to 503s on DB routes.
const SCHEMA_TIMEOUT_MS = 8_000
let _schemaPromise = null

async function safeMigrate(fn, name) {
  try {
    await fn()
  } catch (err) {
    console.warn(`[app] ${name} failed (DB likely unavailable):`, err?.message || err)
  }
}

async function runMigrations() {
  await safeMigrate(migrate, 'migrate')
  await safeMigrate(migratePromptHistory, 'migratePromptHistory')
  await safeMigrate(migrateAgentChats, 'migrateAgentChats')
  await safeMigrate(migrateGenerationJobs, 'migrateGenerationJobs')
}

export function ensureSchema() {
  if (_schemaPromise) return _schemaPromise

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[app] schema init exceeded ${SCHEMA_TIMEOUT_MS}ms — continuing without it`)
      resolve()
    }, SCHEMA_TIMEOUT_MS)
  })

  _schemaPromise = Promise.race([runMigrations(), timeout]).finally(() => clearTimeout(timer))
  return _schemaPromise
}

// Warm the schema in the background when a database is configured. This is a
// floating promise — module evaluation never waits on it.
if (hasDb) {
  ensureSchema().catch(() => {})
}

function isDbError(err) {
  return err?.statusCode === 503 || /database unavailable/i.test(err?.message)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbConnected: hasDb })
})
/**
 * Public client configuration. Exposes only values that are public by design
 * (OAuth client IDs are embedded in every sign-in page Google serves anyway).
 */
app.get('/api/config', (_req, res) => {
  // Both flows need an email channel. Until one is configured, the login page
  // hides "Forgot password?" and signup skips the code gate.
  const emailConfigured = isEmailConfigured()
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    passwordResetEnabled: emailConfigured,
    emailVerificationEnabled: emailConfigured,
  })
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

/**
 * GET /api/shared/decks/:id — public, read-only deck for share links.
 *
 * Registered before the auth guard on purpose: the Share button exists so a
 * link can be opened by someone who has no account. Deck ids are random
 * 72-bit tokens, so the link itself is the permission. Nothing is writable
 * here, and no owner or account data leaves the server.
 */
app.get('/api/shared/decks/:id', async (req, res) => {
  try {
    const deck = await getDeckById(req.params.id)
    if (!deck) return res.status(404).json({ error: 'Deck not found' })
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json({ deck })
  } catch (err) {
    console.error('[shared deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: err?.message || 'Failed to load shared deck' })
  }
})

// All other /api routes require JWT auth
app.use('/api', authMiddleware)

/**
 * POST /api/shared/decks/:id/copy — start your own deck from a shared one.
 *
 * This is where the "Start from this deck" button on a share link lands once
 * the visitor has an account: the deck they just read becomes an editable
 * copy they own. No model call runs, so it costs no credits, and the copy
 * gets a fresh id instead of touching the original.
 */
app.post('/api/shared/decks/:id/copy', async (req, res) => {
  try {
    const source = await getDeckById(req.params.id)
    if (!source) return res.status(404).json({ error: 'Deck not found' })

    const copy = { ...source }
    delete copy.id
    delete copy.updatedAt

    const { id } = await saveDeck(copy, req.user.id)
    res.json({ deck: { ...copy, id } })
  } catch (err) {
    console.error('[copy shared deck] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: err?.message || 'Failed to copy deck' })
  }
})

/**
 * Current user's credit balance plus the per-deck price the client should
 * surface. Used by the TopBar pill and the out-of-credits banner.
 */
app.get('/api/credits', async (req, res) => {
  try {
    const balanceCents = await getCredits(req.user.id)
    res.json({ balanceCents, deckCostCents: BASE_DECK_CENTS })
  } catch (err) {
    console.error('[credits] error:', err)
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable' })
    }
    res.status(500).json({ error: 'Failed to load credits' })
  }
})

/**
 * Deck export endpoints.
 *
 * The browser sends the deck JSON; the builders render each slide from the
 * same document the viewer shows and return `{ buffer, mode }`. When the host
 * has no headless browser they fall back to native text slides and report
 * `X-Export-Mode: text`, which tells the viewer to render the deck itself.
 */
const EXPORT_FORMATS = [
  {
    ext: 'pptx',
    label: 'PPTX',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    build: buildPptxBuffer,
  },
  {
    ext: 'pdf',
    label: 'PDF',
    mime: 'application/pdf',
    build: buildPdfBuffer,
  },
]

for (const { ext, label, mime, build } of EXPORT_FORMATS) {
  app.post(`/api/export/${ext}`, async (req, res) => {
    try {
      const { deck } = req.body || {}
      if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
        return res.status(400).json({ error: 'deck.slides is required' })
      }

      const { buffer, mode } = await build(deck)

      res.setHeader('Content-Type', mime)
      res.setHeader('Content-Disposition', `attachment; filename="${slugify(deck.title)}.${ext}"`)
      res.setHeader('Content-Length', buffer.length)
      res.setHeader('X-Export-Mode', mode)
      res.send(buffer)
    } catch (err) {
      console.error(`[export/${ext}] error:`, err)
      if (err?.code === 'NO_BROWSER') {
        return res.status(503).json({ error: err.message, code: 'NO_BROWSER' })
      }
      res.status(500).json({ error: err?.message || `${label} export failed` })
    }
  })
}

app.post('/api/generate-deck', async (req, res) => {
  try {
    const {
      prompt,
      length = '8 cards',
      tone = 'Professional',
      language = 'English',
      mode = 'default',
    } = req.body || {}

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing "prompt"' })
    }

    const costCents = deckCostCents(length)
    const balance = await getCredits(req.user.id)
    if (balance < costCents) {
      return res.status(402).json({
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        balanceCents: balance,
        deckCostCents: costCents,
      })
    }

    const deck = await generateDeck({
      prompt: prompt.trim(),
      length,
      tone,
      language,
      mode,
    })

    const balanceCents = await deductCredits(req.user.id, costCents)

    res.json({
      deck,
      balanceCents,
      deckCostCents: costCents,
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

  const costCents = deckCostCents(length)
  const jobId = (typeof deckId === 'string' && deckId.trim()) ? deckId.trim() : (await generateId())
  try {
    const balance = await getCredits(req.user.id)
    if (balance < costCents) {
      return res.status(402).json({
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        balanceCents: balance,
        deckCostCents: costCents,
      })
    }

    await createGenerationJob(jobId, req.user.id)
    await savePromptHistory(req.user.id, prompt.trim())
  } catch (err) {
    if (isDbError(err)) {
      return res.status(503).json({ error: 'Database unavailable. Generation jobs require a database.' })
    }
    throw err
  }

  const ctx = {
    prompt: prompt.trim(),
    length, tone, language, mode,
    costCents,
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

    if (!closed) setTimeout(poll, 350)
  }

  setTimeout(poll, 350)
})

/* ─────────────────────────────────────────────────────────── */

app.post('/api/generate-deck/stream', async (req, res) => {
  const {
    prompt,
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

    const costCents = deckCostCents(length)
    const balance = await getCredits(req.user.id)
    if (balance < costCents) {
      send('error', {
        error: 'Insufficient credits',
        code: 'insufficient_credits',
        balanceCents: balance,
        deckCostCents: costCents,
      })
      return res.end()
    }

    const ctx = {
      prompt: prompt.trim(),
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
      balanceCents = await deductCredits(req.user.id, costCents)
      await savePromptHistory(req.user.id, prompt.trim())
      send('credits', { balanceCents, deckCostCents: costCents })
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

app.post('/api/edit-slide', async (req, res) => {
  try {
    const { deck, slideIndex, instruction } = req.body || {}
    const { slide, notes } = await editSlide({
      deck,
      slideIndex: Number(slideIndex),
      instruction: typeof instruction === 'string' ? instruction.trim() : '',
    })
    res.json({ slide, notes })
  } catch (err) {
    console.error('[edit-slide] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to edit slide',
    })
  }
})

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

// Unmatched /api paths get JSON, not the SPA fallback.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Last-resort handler. Without this, an error thrown outside a route's own
// try/catch produces Vercel's opaque "A server error has occurred", which is
// impossible to debug from the outside.
app.use((err, _req, res, next) => {
  console.error('[app] unhandled error:', err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: err?.message || 'Internal server error' })
})

export default app
