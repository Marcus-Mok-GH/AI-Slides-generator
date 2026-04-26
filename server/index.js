import express from 'express'
import { generateDeck, regenerateSlide } from './generateDeck.js'

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
