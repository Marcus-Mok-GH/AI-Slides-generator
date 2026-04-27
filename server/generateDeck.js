import { DeckStreamParser } from './streamParser.js'

const ORBITRON_BASE = 'https://orbitron--pastelsjuice8t.replit.app/api'

/**
 * Best-fit model picks for this app:
 * - Full deck content generation: claude-sonnet-4.6
 * - Single-slide regeneration: gpt-5-mini
 */
const DECK_MODEL = 'claude-sonnet-4.6'
const SLIDE_MODEL = 'gpt-5-mini'

/**
 * Slide layouts. Each one is a different visual primitive — picked deliberately
 * by the model based on the kind of point being made. Designed to follow the
 * "one idea per slide" principle from real-world presentation design (Gamma,
 * Tome, Beautiful.ai, Duarte/Reynolds).
 */
const LAYOUTS = [
  'title',       // Hero / cover
  'section',     // Section divider — huge label, no body
  'statement',   // One big sentence — the central insight
  'bullets',     // 3-5 punchy bullets with icons
  'steps',       // Numbered process flow (3-5 steps)
  'comparison',  // Side-by-side A / B
  'stats',       // 3-4 KPI cards
  'quote',       // Pull quote
  'two-column',  // Prose + bullets
  'content',     // Title + short subhead (use sparingly)
]

const FORMAT_DESCRIPTIONS = {
  presentation: 'a slide-based presentation deck',
  document: 'a long-form document broken into sections',
  webpage: 'a single shareable webpage broken into sections',
  social: 'a social-media carousel with short, punchy cards',
}

/**
 * Content-depth modes for presentations. Each mode tweaks the word budgets
 * and per-slide richness so the same prompt can produce a punchy keynote
 * deck or a more detailed sales-pitch deck.
 */
const MODE_RULES = {
  concise: `MODE: CONCISE — strip every slide to the bone.
   - Lean toward "statement", "title", "stats", and "quote" layouts.
   - Bullet slides: max 3 bullets, each ≤ 4 words. Body ≤ 10 words.
   - Speaker notes: a single short cue, ≤ 14 words.
   - Skip "two-column" and "content" entirely.
   - On-screen prose feels like newspaper headlines, not paragraphs.`,
  default: `MODE: DEFAULT — balanced presentation (see word caps above).
   - On-screen word budgets exactly as stated. Don't go over.
   - Speaker notes: 1 sentence, ≤ 22 words — the talking point.`,
  detailed: `MODE: DETAILED — a deck someone can actually deliver on stage.
   The on-screen text MUST still be scannable (don't blow past visible word
   caps), but speaker notes become a REAL spoken script, not a label.

   On-slide content (what the audience sees):
   - Bullets: up to 6 items, each ≤ 8 words.
   - Body / subhead: ≤ 24 words.
   - Stats: 3-4 entries; "label" may be ≤ 4 words with light context.
   - Comparison: 3-4 items per side.

   Speaker notes (what the presenter SAYS, not what the audience sees):
   - 3 to 5 sentences, roughly 60-110 words.
   - Written as natural spoken English, first person ("Here's what we found…",
     "Notice that…", "Let me show you…"). Not a bullet list.
   - Open with a hook or transition from the previous slide.
   - Explain what's on the slide, give the supporting evidence / story / data
     the audience won't see, and end with the takeaway or a bridge to the
     next slide.
   - Concrete examples, real numbers, vivid analogies — the colour the
     visible slide can't carry on its own.
   - DO NOT just restate the bullets. Add the substance behind them.

   On-slide word caps still apply per visible item — DO NOT write paragraphs
   into "title", "body", "bullets", or "stats" fields. The depth lives in
   speakerNotes.`,
}

function parseLength(length) {
  const m = String(length).match(/(\d+)/)
  if (m) return Math.max(3, Math.min(20, parseInt(m[1], 10)))
  return 8
}

function buildDeckSystemPrompt({ format, length, tone, language, mode = 'default' }) {
  const formatDesc = FORMAT_DESCRIPTIONS[format] || FORMAT_DESCRIPTIONS.presentation
  const cardCount = parseLength(length)
  const modeBlock = MODE_RULES[mode] || MODE_RULES.default

  return `You are a senior presentation designer (think Gamma, Tome, Duarte) who
drafts ${formatDesc}. You design real slides, not text dumps. Slides are
SCANNED, not read.

Return ONLY valid JSON (no prose, no code fences). Match this exact schema:

{
  "title": "Deck title (≤ 6 words, punchy)",
  "subtitle": "One sentence (≤ 14 words) that frames the deck",
  "theme": {
    "name": "Short theme name e.g. 'Aurora', 'Mono', 'Sunrise'",
    "primary": "#hex",
    "accent":  "#hex",
    "background": "#hex"
  },
  "slides": [
    {
      "title": "Slide title (≤ 6 words)",
      "layout": "one of: ${LAYOUTS.join(' | ')}",
      "body": "Optional ≤ 18-word subhead. Never a paragraph.",
      "bullets":   ["Optional 3-5 items, each ≤ 6 words"],
      "steps":     [{"label":"Step name (≤ 4 words)","detail":"≤ 10 words"}],
      "comparison":{
        "leftLabel":"e.g. Before","leftItems":["≤ 6 words","≤ 6 words","≤ 6 words"],
        "rightLabel":"e.g. After","rightItems":["≤ 6 words","≤ 6 words","≤ 6 words"]
      },
      "stats":     [{"label":"≤ 3 words","value":"e.g. 92% or $1.2B or 4.4 km/s"}],
      "quote":     {"text":"≤ 22 words","attribution":"Name, role"},
      "sectionLabel":"For 'section' layout: a 1-3 word section eyebrow",
      "imagePrompt":"1-sentence editorial photo description for this slide — concrete, evocative, NO text/logos/words in image. Used as bg for hero/section/statement and side panel for bullets/stats/quote/content.",
      "speakerNotes":"1 sentence (≤ 22 words) — the talking point a speaker says"
    }
  ]
}

DESIGN LAW — follow strictly:

1. ONE IDEA PER SLIDE. If you have two ideas, make two slides.

2. WORD BUDGETS (hard caps):
   - Title: ≤ 6 words.
   - Body / subhead: ≤ 18 words. NEVER write a paragraph.
   - Bullets: 3-5 items, each ≤ 6 words. Apply the 5/5/5 rule.
   - Steps: 3-5 entries; "label" ≤ 4 words; "detail" ≤ 10 words.
   - Comparison: 3 items per side, each ≤ 6 words.
   - Stats: 3-4 entries; "label" ≤ 3 words; "value" is the headline number.
   - Quote: ≤ 22 words.
   - Speaker notes: 1 sentence, ≤ 22 words.

3. LAYOUT DIVERSITY (mandatory):
   - First slide MUST be "title".
   - Last slide MUST be "statement" (a closing call-to-action) OR "quote".
   - Use AT LEAST 4 different non-title layouts across the deck.
   - Never repeat the same layout in 3 consecutive slides.
   - Prefer "statement" for headline insights — make at least 1 if the deck has
     5+ slides. Prefer "steps" for processes, "comparison" for contrasts,
     "stats" for numbers, "quote" for evidence/voice.
   - For decks with 8+ slides, insert at least 1 "section" divider to chapter
     the deck. The section divider has only "title" + "sectionLabel" — no body.
   - Use "two-column" sparingly (max once); never use "content" more than once.

4. FILL ONLY WHAT THE LAYOUT NEEDS. Leave other fields empty / unset:
   - title         → title (subtitle is the deck.subtitle, slide.body holds it)
   - section       → title + sectionLabel
   - statement     → title (the bold sentence) + optional 1-line body
   - bullets       → title + bullets[3-5]
   - steps         → title + steps[3-5]
   - comparison    → title + comparison{leftLabel,leftItems,rightLabel,rightItems}
   - stats         → title + stats[3-4]
   - quote         → title + quote{text,attribution}
   - two-column    → title + body (≤ 18 words) + bullets[3-5]
   - content       → title + body (≤ 18 words)

   ALWAYS include "imagePrompt" for EVERY slide EXCEPT "steps" and
   "comparison" (which have no room for imagery). The image is the
   visual hook of the slide — make it vivid and specific.
   Write a 1-sentence editorial photograph description tied to the slide
   content: concrete subject, mood, lighting, environment.
   NO text, NO logos, NO words inside the image.

5. WRITING:
   - Tone: ${tone}.
   - Output language: ${language}.
   - Active voice. Concrete nouns. No filler ("In this slide…", "We will discuss…").
   - Numbers and verbs > adjectives. Show, don't narrate.
   - Generate exactly ${cardCount} slides.

6. ${modeBlock}

7. THEME:
   - Pick a cohesive palette that matches the topic and tone.
   - "background" should be a deep, low-saturation color (works for white text).
   - "primary" and "accent" should be vivid and harmonize with each other.

Return strictly valid JSON. Do not wrap in markdown.`
}

function buildSlideSystemPrompt({ layout, tone, language }) {
  return `You rewrite a single slide inside an existing deck. Keep the deck's
overall tone consistent. Slides are SCANNED, not read.

Return ONLY valid JSON (no prose, no code fences) for ONE slide, matching:

{
  "title": "Slide title (≤ 6 words)",
  "layout": "${layout}",
  "body": "Optional ≤ 18-word subhead",
  "bullets":   ["≤ 6 words each"],
  "steps":     [{"label":"≤ 4 words","detail":"≤ 10 words"}],
  "comparison":{"leftLabel":"...","leftItems":["..."],"rightLabel":"...","rightItems":["..."]},
  "stats":     [{"label":"≤ 3 words","value":"..."}],
  "quote":     {"text":"≤ 22 words","attribution":"..."},
  "sectionLabel":"...",
  "imagePrompt":"1-sentence editorial photo description (no text in image)",
  "speakerNotes":"1 sentence (≤ 22 words)"
}

Rules:
- Use the layout "${layout}" exactly. Fill only the fields that layout needs.
- Layout → required fields:
    title       → title, body (acts as subtitle)
    section     → title, sectionLabel
    statement   → title (the bold sentence), optional 1-line body
    bullets     → title, bullets[3-5] (≤ 6 words each)
    steps       → title, steps[3-5]
    comparison  → title, comparison{leftLabel,leftItems[3], rightLabel,rightItems[3]}
    stats       → title, stats[3-4]
    quote       → title, quote{text,attribution}
    two-column  → title, body, bullets[3-5]
    content     → title, body (≤ 18 words)
- Word caps are hard. Apply the 5/5/5 rule.
- Active voice. Concrete nouns. No filler.
- Tone: ${tone}.
- Output language: ${language}.
- Always include a one-sentence "speakerNotes" (≤ 22 words).
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
  const layout = LAYOUTS.includes(s?.layout)
    ? s.layout
    : fallbackIndex === 0
      ? 'title'
      : 'statement'

  return {
    title: String(s?.title || `Slide ${fallbackIndex + 1}`),
    layout,
    body: s?.body ? String(s.body) : '',
    bullets: Array.isArray(s?.bullets) ? s.bullets.map(String) : [],
    steps: Array.isArray(s?.steps)
      ? s.steps.map((x) => ({
          label: String(x?.label || ''),
          detail: String(x?.detail || ''),
        }))
      : [],
    comparison:
      s?.comparison && typeof s.comparison === 'object'
        ? {
            leftLabel: String(s.comparison.leftLabel || 'Before'),
            leftItems: Array.isArray(s.comparison.leftItems)
              ? s.comparison.leftItems.map(String)
              : [],
            rightLabel: String(s.comparison.rightLabel || 'After'),
            rightItems: Array.isArray(s.comparison.rightItems)
              ? s.comparison.rightItems.map(String)
              : [],
          }
        : null,
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
    sectionLabel: s?.sectionLabel ? String(s.sectionLabel) : '',
    imagePrompt: s?.imagePrompt ? String(s.imagePrompt) : '',
    image:
      s?.image && typeof s.image === 'object' && s.image.url
        ? {
            url: String(s.image.url),
            prompt: String(s.image.prompt || ''),
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
      mode: ctx.mode || 'default',
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

/**
 * Streaming variant. Calls Orbitron with the same prompt as generateDeck but
 * forwards meta + each completed slide as it parses out of the model's stream.
 */
export async function streamGenerateDeck(ctx, handlers = {}) {
  const system = buildDeckSystemPrompt(ctx)
  const user = `Topic / brief:\n"""${ctx.prompt}"""\n\nGenerate the deck JSON now.`

  const upstream = await fetch(`${ORBITRON_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ORBITRON_API_KEY}`,
    },
    body: JSON.stringify({
      modelId: DECK_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Orbitron ${upstream.status}: ${text.slice(0, 300)}`)
  }

  const parser = new DeckStreamParser()
  let raw = ''
  let pending = ''

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()

  const emit = (events) => {
    for (const ev of events) {
      if (ev.type === 'meta') {
        handlers.onMeta?.(ev.meta)
      } else if (ev.type === 'partial') {
        handlers.onPartial?.({ index: ev.index, partial: ev.partial })
      } else if (ev.type === 'slide') {
        const normalized = normalizeSlide(ev.slide, ev.index)
        handlers.onSlide?.({ slide: normalized, index: ev.index })
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })

    const lines = pending.split('\n')
    pending = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload) continue
      try {
        const obj = JSON.parse(payload)
        if (obj.error) {
          throw new Error(obj.error.message || 'AI error')
        }
        if (typeof obj.delta === 'string' && obj.delta) {
          raw += obj.delta
          emit(parser.feed(obj.delta))
        }
      } catch (e) {
        if (e?.message && !/Unexpected token|in JSON at/.test(e.message)) {
          throw e
        }
      }
    }
  }

  if (!raw) throw new Error('Empty response from model')
  const parsed = extractJson(raw)
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
    : 'Sharpen it — cut filler, make it scannable, hit the word caps.'
}

Return JSON for the rewritten slide only.`

  const content = await callOrbitron({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)
  // Keep the requested layout — don't let the model swap it.
  return normalizeSlide({ ...parsed, layout: target.layout }, slideIndex)
}
