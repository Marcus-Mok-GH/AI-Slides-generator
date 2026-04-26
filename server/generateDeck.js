const ORBITRON_BASE = 'https://orbitron--pastelsjuice8t.replit.app/api'

/**
 * Best-fit model picks for this app:
 * - Full deck content generation: claude-sonnet-4.6
 *     "Latest Sonnet generation — balanced intelligence and speed."
 *     Excellent at structured JSON output, theme cohesion, and tight prose.
 * - Single-slide regeneration: gpt-5-mini
 *     "Fast and cheap GPT-5 variant. Production workhorse for most chat
 *      and tool-use workloads."
 *     Smaller scope per call → favor speed and cost over peak reasoning.
 */
const DECK_MODEL = 'claude-sonnet-4.6'
const SLIDE_MODEL = 'gpt-5-mini'

const LAYOUTS = ['title', 'content', 'two-column', 'bullets', 'quote', 'stats']

const FORMAT_DESCRIPTIONS = {
  presentation: 'a slide-based presentation deck',
  document: 'a long-form document broken into sections',
  webpage: 'a single shareable webpage broken into sections',
  social: 'a social-media carousel with short, punchy cards',
}

function parseLength(length) {
  const m = String(length).match(/(\d+)/)
  if (m) return Math.max(3, Math.min(20, parseInt(m[1], 10)))
  return 8
}

function buildDeckSystemPrompt({ format, length, tone, language }) {
  const formatDesc = FORMAT_DESCRIPTIONS[format] || FORMAT_DESCRIPTIONS.presentation
  const cardCount = parseLength(length)

  return `You are an expert presentation designer that drafts ${formatDesc}.

Return ONLY valid JSON (no prose, no code fences). Match this exact schema:

{
  "title": "Deck title (short, punchy)",
  "subtitle": "One-sentence subtitle that frames the deck",
  "theme": {
    "name": "Short theme name e.g. 'Aurora', 'Mono', 'Sunrise'",
    "primary": "#hex",
    "accent": "#hex",
    "background": "#hex"
  },
  "slides": [
    {
      "title": "Slide title",
      "layout": "one of: ${LAYOUTS.join(' | ')}",
      "body": "Optional paragraph for layouts that need prose",
      "bullets": ["Optional", "list", "of bullets"],
      "stats": [{"label":"...","value":"..."}],
      "quote": {"text": "...", "attribution": "..."},
      "speakerNotes": "1-2 sentences of speaker notes"
    }
  ]
}

Rules:
- Generate exactly ${cardCount} slides.
- The first slide MUST use layout "title" and contain the deck title and subtitle.
- The last slide should be a closing / call-to-action / thank-you card.
- Choose appropriate layouts per slide; do not repeat the same layout more than 3 times in a row.
- Bullets: 3-5 short items (max 10 words each).
- "stats" layout: provide 3-4 entries in the "stats" array.
- "quote" layout: fill the "quote" object.
- "two-column" layout: provide both "body" and "bullets".
- Tone: ${tone}.
- Output language: ${language}.
- Keep titles under 8 words. Keep body under 60 words per slide.
- Pick a cohesive color theme that matches the topic and tone. Use real hex colors.

Return strictly valid JSON. Do not wrap in markdown.`
}

function buildSlideSystemPrompt({ layout, tone, language }) {
  return `You rewrite a single slide inside an existing deck. Keep the deck's
overall tone and direction consistent.

Return ONLY valid JSON (no prose, no code fences) for ONE slide, matching:

{
  "title": "Slide title",
  "layout": "${layout}",
  "body": "...",
  "bullets": ["..."],
  "stats": [{"label":"...","value":"..."}],
  "quote": {"text":"...","attribution":"..."},
  "speakerNotes": "..."
}

Rules:
- Use the layout "${layout}" exactly. Fill only the fields that layout needs:
    - "title": fill "title", "body" (subtitle).
    - "content": fill "title", "body" (and optionally "bullets").
    - "two-column": fill "title", "body" AND "bullets".
    - "bullets": fill "title" and 3-5 punchy "bullets".
    - "stats": fill "title" and 3-4 entries in "stats".
    - "quote": fill "title" and "quote" {text, attribution}.
- Keep title under 8 words. Body under 60 words. Bullets max 10 words each.
- Tone: ${tone}.
- Output language: ${language}.
- Always include a one-sentence "speakerNotes".
Return strictly valid JSON. No markdown.`
}

async function callOrbitron({ model, system, user }) {
  const url = `${ORBITRON_BASE}/chat`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ORBITRON_API_KEY}`,
    },
    body: JSON.stringify({
      modelId: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Orbitron ${res.status}: ${text.slice(0, 300)}`)
  }

  const raw = await res.text()
  let content = ''
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload) continue
    try {
      const obj = JSON.parse(payload)
      if (typeof obj.delta === 'string') content += obj.delta
      if (obj.error) throw new Error(obj.error.message || 'AI error')
    } catch {
      // ignore non-JSON keepalive lines
    }
  }

  if (!content) throw new Error('Empty response from model')
  return content
}

function extractJson(text) {
  try {
    return JSON.parse(text)
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {}
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1))
  }
  throw new Error('Model did not return parseable JSON')
}

function normalizeSlide(s, fallbackIndex = 0) {
  return {
    title: String(s?.title || `Slide ${fallbackIndex + 1}`),
    layout: LAYOUTS.includes(s?.layout)
      ? s.layout
      : fallbackIndex === 0
        ? 'title'
        : 'content',
    body: s?.body ? String(s.body) : '',
    bullets: Array.isArray(s?.bullets) ? s.bullets.map(String) : [],
    stats: Array.isArray(s?.stats)
      ? s.stats.map((x) => ({
          label: String(x?.label || ''),
          value: String(x?.value || ''),
        }))
      : [],
    quote:
      s?.quote && typeof s.quote === 'object'
        ? {
            text: String(s.quote.text || ''),
            attribution: String(s.quote.attribution || ''),
          }
        : null,
    speakerNotes: s?.speakerNotes ? String(s.speakerNotes) : '',
  }
}

function normalizeDeck(raw, ctx) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid deck object')
  const slides = Array.isArray(raw.slides) ? raw.slides : []
  if (slides.length === 0) throw new Error('Deck has no slides')

  const theme = raw.theme && typeof raw.theme === 'object' ? raw.theme : {}
  return {
    title: String(raw.title || 'Untitled deck'),
    subtitle: raw.subtitle ? String(raw.subtitle) : '',
    theme: {
      name: String(theme.name || 'Aurora'),
      primary: String(theme.primary || '#7c5cff'),
      accent: String(theme.accent || '#ff6ea0'),
      background: String(theme.background || '#0f0f1a'),
    },
    slides: slides.map((s, i) => normalizeSlide(s, i)),
    meta: {
      model: DECK_MODEL,
      prompt: ctx.prompt,
      format: ctx.format,
      length: ctx.length,
      tone: ctx.tone,
      language: ctx.language,
      generatedAt: new Date().toISOString(),
    },
  }
}

export async function generateDeck(ctx) {
  const system = buildDeckSystemPrompt(ctx)
  const user = `Topic / brief:\n"""${ctx.prompt}"""\n\nGenerate the deck JSON now.`
  const content = await callOrbitron({ model: DECK_MODEL, system, user })
  const parsed = extractJson(content)
  return normalizeDeck(parsed, ctx)
}

export async function regenerateSlide({ deck, slideIndex, instruction }) {
  if (!deck || !Array.isArray(deck.slides)) {
    throw new Error('Missing deck')
  }
  if (slideIndex < 0 || slideIndex >= deck.slides.length) {
    throw new Error('Invalid slideIndex')
  }
  const target = deck.slides[slideIndex]
  const meta = deck.meta || {}

  const otherSlides = deck.slides
    .map((s, i) => `${i + 1}. ${s.title} [${s.layout}]`)
    .join('\n')

  const system = buildSlideSystemPrompt({
    layout: target.layout,
    tone: meta.tone || 'Professional',
    language: meta.language || 'English',
  })

  const user = `Deck title: "${deck.title}"
Deck subtitle: "${deck.subtitle}"
Original brief: """${meta.prompt || ''}"""

All slides in the deck (for context — do not duplicate them):
${otherSlides}

You are rewriting slide #${slideIndex + 1} ("${target.title}") which uses the
"${target.layout}" layout.

Current contents (for reference):
${JSON.stringify(target, null, 2)}

${
  instruction
    ? `Apply this user instruction:\n"""${instruction}"""\n`
    : 'Improve clarity, sharpness, and impact while keeping the topic the same.'
}

Return JSON for the rewritten slide only.`

  const content = await callOrbitron({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)
  // Keep the requested layout — don't let the model swap it.
  return normalizeSlide({ ...parsed, layout: target.layout }, slideIndex)
}
