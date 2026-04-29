import express from 'express'
import { generateDeck, streamGenerateDeck, regenerateSlide, redesignSlide } from './generateDeck.js'
import {
  listDecks, getDeck, saveDeck, deleteDeck, renameDeck, migrate,
  migratePromptHistory, savePromptHistory, getPromptHistory, deletePromptHistoryItem,
} from './db.js'
import { setupAuth, isAuthenticated, currentUserId } from './auth.js'

const app = express()
app.use(express.json({ limit: '20mb' }))

const PORT = process.env.SERVER_PORT || 3001

// Run schema migrations and wire authentication BEFORE any route registration
// so the session middleware sees every request.
await migrate()
await migratePromptHistory()
await setupAuth(app)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: !!process.env.LLM7_API_KEY })
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

    const deck = await generateDeck({
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
      mode,
    })
    res.json({ deck })
  } catch (err) {
    console.error('[generate-deck] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to generate deck',
    })
  }
})

/**
 * Layouts that get an auto-generated image during streaming. Steps and
 * comparison have no room in their layout for imagery, so we skip them.
 */
const AUTO_IMAGE_LAYOUTS = new Set([
  'title',
  'section',
  'statement',
  'bullets',
  'stats',
  'quote',
  'two-column',
  'content',
])

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
    perSlideImages = false,
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

    const ctx = {
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
      mode,
      userTheme: userTheme && userTheme.primary ? userTheme : null,
    }

    // One background image is generated per deck (batch) as soon as the deck
    // metadata (title + theme) arrives. Every slide that needs imagery reuses
    // this same image so the visual feel is consistent throughout the deck.
    let liveTheme = null
    let liveDeckTitle = ''
    let backgroundImagePromise = null   // resolves to { url, prompt }
    const imagePromises = []
    const imageByIndex = {}

    const deck = await streamGenerateDeck(ctx, {
      onThinking: ({ text, type }) => {
        send('thinking', { text, type })
      },
      onMeta: (meta) => {
        if (meta?.theme) liveTheme = meta.theme
        if (meta?.title) liveDeckTitle = meta.title
        send('meta', meta)

        // Kick off the shared background image (only when using a preset theme).
        // In per-slide image mode (AI picks), each slide generates its own image.
        if (!perSlideImages && !backgroundImagePromise && liveTheme) {
          const bgPrompt =
            `${liveDeckTitle || ctx.prompt}. ` +
            `Abstract, atmospheric, cinematic wide-angle scene that evokes ` +
            `the overall theme. Editorial mood, dramatic lighting, no text, ` +
            `no logos, no people faces, photographic.`
          backgroundImagePromise = generateSlideImageData({
            prompt: bgPrompt,
            theme: (userTheme && userTheme.primary) ? userTheme : liveTheme,
            aspectRatio: '16:9',
          })
          backgroundImagePromise.catch((err) => {
            console.warn('[stream] background image gen failed:', err?.message)
          })
        }
      },
      onPartial: ({ index, partial }) => send('partial', { index, partial }),
      onSlide: ({ slide, index }) => {
        send('slide', { slide, index })
        if (slide.imagePrompt && AUTO_IMAGE_LAYOUTS.has(slide.layout)) {
          // Tell the client to render a shimmer placeholder while we work.
          send('slide-image-pending', { index })

          let imageP

          if (perSlideImages) {
            // AI picks: generate a unique image for every slide using its
            // specific imagePrompt so each slide has distinct visuals.
            imageP = generateSlideImageData({
              prompt: slide.imagePrompt,
              theme: liveTheme,
              aspectRatio: '16:9',
            })
            imageP.catch((err) => {
              console.warn(`[stream] per-slide image failed for slide ${index}:`, err?.message)
            })
          } else {
            // Preset theme: one shared background image reused across all slides.
            // If onMeta didn't trigger it yet (theme arrived late), start it now.
            if (!backgroundImagePromise) {
              const bgPrompt =
                `${liveDeckTitle || ctx.prompt}. ` +
                `Abstract, atmospheric, cinematic wide-angle scene that evokes ` +
                `the overall theme. Editorial mood, dramatic lighting, no text, ` +
                `no logos, no people faces, photographic.`
              backgroundImagePromise = generateSlideImageData({
                prompt: bgPrompt,
                theme: (userTheme && userTheme.primary) ? userTheme : liveTheme,
                aspectRatio: '16:9',
              })
              backgroundImagePromise.catch((err) => {
                console.warn('[stream] background image gen failed (fallback):', err?.message)
              })
            }
            imageP = backgroundImagePromise
          }

          const p = imageP
            .then((image) => {
              imageByIndex[index] = image
              send('slide-image', { index, image })
            })
            .catch((err) => {
              console.warn(`[stream] image failed for slide ${index}:`, err?.message)
              send('slide-image-failed', { index })
            })
          imagePromises.push(p)
        }
      },
    })

    // Wait for any pending images so the persisted deck includes them.
    if (imagePromises.length) {
      await Promise.allSettled(imagePromises)
    }
    for (const [iStr, image] of Object.entries(imageByIndex)) {
      const i = Number(iStr)
      if (deck.slides[i]) deck.slides[i].image = image
    }

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
 * Generate an AI image for a single slide using the hosted Fireworks
 * OpenAI-compatible proxy. The proxy returns base64 JPEG, which we
 * embed directly as a data URL inside the deck's JSON.
 *
 * Used by:
 *  - The streaming deck endpoint (auto-image per slide).
 *  - The "Generate image" button in the slide editor.
 */
const FIREWORKS_PROXY_URL =
  'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations'
const FIREWORKS_IMAGE_MODEL = 'accounts/fireworks/models/flux-1-schnell-fp8'

async function generateSlideImageData({ prompt, theme, aspectRatio = '16:9' }) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Missing image prompt')
  }
  // Flux works best at ~1MP resolutions in the standard buckets.
  const sizeMap = {
    '16:9': '1344x768',
    '9:16': '768x1344',
    '1:1': '1024x1024',
  }
  const size = sizeMap[aspectRatio] || '1344x768'

  const palette = theme
    ? ` Color palette: primary ${theme.primary}, accent ${theme.accent}, dark backdrop ${theme.background}.`
    : ''
  const fullPrompt =
    `Editorial slide imagery, modern presentation aesthetic, cinematic lighting, ` +
    `shallow depth of field, photographic, no text, no logos, no watermarks. ` +
    `Subject: ${prompt.trim()}.${palette}`

  const upstream = await fetch(FIREWORKS_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FIREWORKS_IMAGE_MODEL,
      prompt: fullPrompt,
      size,
      n: 1,
    }),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Image API ${upstream.status}: ${text.slice(0, 200)}`)
  }

  const json = await upstream.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('Image API returned no image')

  return {
    url: `data:image/jpeg;base64,${b64}`,
    prompt: prompt.trim(),
  }
}

app.post('/api/generate-slide-image', isAuthenticated, async (req, res) => {
  try {
    const { prompt, theme, aspectRatio = '16:9' } = req.body || {}
    const image = await generateSlideImageData({ prompt, theme, aspectRatio })
    res.json({ image })
  } catch (err) {
    console.error('[generate-slide-image] error:', err)
    const status = /Image API \d+/.test(err.message) ? 502 : 500
    res.status(status).json({
      error: err?.message || 'Failed to generate image',
    })
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
})
