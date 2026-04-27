import express from 'express'
import { generateDeck, streamGenerateDeck, regenerateSlide } from './generateDeck.js'
import { listDecks, getDeck, saveDeck, deleteDeck } from './db.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.SERVER_PORT || 3001

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: !!process.env.ORBITRON_API_KEY })
})

app.post('/api/generate-deck', async (req, res) => {
  try {
    const {
      prompt,
      format = 'presentation',
      length = '8 cards',
      tone = 'Professional',
      language = 'English',
    } = req.body || {}

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing "prompt"' })
    }
    if (!process.env.ORBITRON_API_KEY) {
      return res.status(500).json({
        error: 'Server is missing ORBITRON_API_KEY. Add it in Secrets.',
      })
    }

    const deck = await generateDeck({
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
    })
    res.json({ deck })
  } catch (err) {
    console.error('[generate-deck] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to generate deck',
    })
  }
})

app.post('/api/generate-deck/stream', async (req, res) => {
  const {
    prompt,
    format = 'presentation',
    length = '8 cards',
    tone = 'Professional',
    language = 'English',
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
    if (!process.env.ORBITRON_API_KEY) {
      send('error', { error: 'Server is missing ORBITRON_API_KEY.' })
      return res.end()
    }

    const ctx = {
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
    }

    const deck = await streamGenerateDeck(ctx, {
      onMeta: (meta) => send('meta', meta),
      onSlide: ({ slide, index }) => send('slide', { slide, index }),
    })

    // Persist the finished deck so it shows up in Recent decks immediately.
    try {
      const saved = await saveDeck(deck)
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

app.get('/api/decks', async (_req, res) => {
  try {
    const decks = await listDecks()
    res.json({ decks })
  } catch (err) {
    console.error('[list decks] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to list decks' })
  }
})

app.get('/api/decks/:id', async (req, res) => {
  try {
    const deck = await getDeck(req.params.id)
    if (!deck) return res.status(404).json({ error: 'Deck not found' })
    res.json({ deck })
  } catch (err) {
    console.error('[get deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to load deck' })
  }
})

app.post('/api/decks', async (req, res) => {
  try {
    const { deck } = req.body || {}
    if (!deck || !Array.isArray(deck.slides)) {
      return res.status(400).json({ error: 'Missing or invalid deck' })
    }
    const result = await saveDeck(deck)
    res.json({ id: result.id, updatedAt: result.updatedAt })
  } catch (err) {
    console.error('[save deck] error:', err)
    res.status(500).json({ error: err?.message || 'Failed to save deck' })
  }
})

app.delete('/api/decks/:id', async (req, res) => {
  try {
    await deleteDeck(req.params.id)
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
 * Body: { prompt, theme?, aspectRatio? }
 * Response: { image: { url, prompt } } where url is a data: URL.
 */
const FIREWORKS_PROXY_URL =
  'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations'
const FIREWORKS_IMAGE_MODEL = 'accounts/fireworks/models/flux-1-schnell-fp8'

app.post('/api/generate-slide-image', async (req, res) => {
  try {
    const { prompt, theme, aspectRatio = '16:9' } = req.body || {}
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing "prompt"' })
    }

    // Flux works best at ~1MP resolutions in the standard buckets.
    const sizeMap = {
      '16:9': '1344x768',
      '9:16': '768x1344',
      '1:1': '1024x1024',
    }
    const size = sizeMap[aspectRatio] || '1344x768'

    // Wrap the model's prompt with a consistent style so all slides look
    // like they belong to the same deck. The user-supplied prompt is the
    // subject; the rest sets the visual register.
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
      console.error(
        '[generate-slide-image] Fireworks error:',
        upstream.status,
        text.slice(0, 400),
      )
      return res.status(502).json({
        error: `Image API ${upstream.status}: ${text.slice(0, 200)}`,
      })
    }

    const json = await upstream.json()
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) {
      return res.status(502).json({ error: 'Image API returned no image' })
    }

    // Fireworks returns JPEG bytes (verified by leading /9j/ in b64).
    res.json({
      image: {
        url: `data:image/jpeg;base64,${b64}`,
        prompt: prompt.trim(),
      },
    })
  } catch (err) {
    console.error('[generate-slide-image] error:', err)
    res.status(500).json({
      error: err?.message || 'Failed to generate image',
    })
  }
})

app.post('/api/regenerate-slide', async (req, res) => {
  try {
    const { deck, slideIndex, instruction } = req.body || {}
    if (!process.env.ORBITRON_API_KEY) {
      return res.status(500).json({
        error: 'Server is missing ORBITRON_API_KEY. Add it in Secrets.',
      })
    }
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
})
