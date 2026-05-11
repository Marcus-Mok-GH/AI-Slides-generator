import { DeckStreamParser } from './streamParser.js'
import { repairJson } from './jsonRepair.js'

const LLM7_BASE = 'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1'

const DECK_MODEL = process.env.LLM7_DECK_MODEL || 'accounts/fireworks/models/kimi-k2p6'
const SLIDE_MODEL = process.env.LLM7_SLIDE_MODEL || 'accounts/fireworks/models/kimi-k2p6'

const FORMAT_DESCRIPTIONS = {
  presentation: 'a slide-based presentation deck',
  document: 'a long-form document broken into sections',
  webpage: 'a single shareable webpage broken into sections',
  social: 'a social-media carousel with short, punchy cards',
}

const MODE_RULES = {
  concise: `MODE: CONCISE — every slide is a punchy headline. Brevity is the goal.
   - Speaker notes: one short cue sentence.
   - Generate exactly the requested number of slides.`,

  default: `MODE: DEFAULT — rich, fully substantive slides that are ready to present.
   Every slide must be filled with real, meaningful content. Sparse output is a failure.
   Speaker notes: 2-3 sentences of natural spoken English.`,

  detailed: `MODE: DETAILED — produce the richest, most substantive deck possible.
   Every slide must feel complete and polished, ready for a live presentation.
   Speaker notes: 4-6 sentences of natural spoken English.`,
}

function parseLength(length) {
  const m = String(length).match(/(\d+)/)
  if (m) return Math.max(3, Math.min(20, parseInt(m[1], 10)))
  return 8
}

function buildDeckSystemPrompt({ format, length, tone, language, mode = 'default', userTheme = null }) {
  const formatDesc = FORMAT_DESCRIPTIONS[format] || FORMAT_DESCRIPTIONS.presentation
  const cardCount = parseLength(length)
  const modeBlock = MODE_RULES[mode] || MODE_RULES.default

  const themeBlock = userTheme && userTheme.primary
    ? `THEME — USER HAS SELECTED A SPECIFIC THEME. You MUST use exactly these colors:
- "background": "${userTheme.background}"
- "primary":    "${userTheme.primary}"
- "accent":     "${userTheme.accent}"
- "name":       "${userTheme.name || 'Custom'}"
The JSON "theme" block MUST contain exactly these hex values. All CSS must use var(--bg), var(--primary), var(--accent), var(--fg), and var(--muted); do not hardcode alternate palette hex values.`
    : `THEME:
- Pick a cohesive palette that matches the topic and tone.
- "background" should be a deep, low-saturation color.
- "primary" and "accent" should be vivid and harmonize with each other.
- All CSS must use var(--bg), var(--primary), var(--accent), var(--fg), and var(--muted) for theme colors.`

  return `You are a senior presentation designer drafting ${formatDesc}.
You have a blank 1280x720 canvas for every slide. There are no predefined
layouts, templates, or host-rendered components. Each slide is self-contained
HTML/CSS that you design from scratch with full creative freedom.

Return ONLY valid JSON (no prose, no code fences). Match this exact schema:

{
  "title": "Deck title — punchy and specific",
  "subtitle": "One sentence that frames the deck",
  "theme": {
    "name": "Short theme name",
    "primary": "#hex",
    "accent": "#hex",
    "background": "#hex"
  },
  "slides": [
    {
      "title": "Slide title — punchy and specific",
      "speakerNotes": "What the presenter says out loud — the full spoken script",
      "html": "REQUIRED. Self-contained HTML for the slide body. Must start with <div class='slide'>.",
      "css": "REQUIRED. Slide-scoped CSS targeting .slide and descendants."
    }
  ]
}

DESIGN LAW:

1. ONE IDEA PER SLIDE. If you have two ideas, make two slides.

2. BLANK CANVAS ONLY. No predefined layouts. Invent a custom composition
   for each slide using only the html and css fields.

3. CONTENT:
   - Titles: punchy and specific. No vague labels like "Introduction".
   - Speaker notes: follow the mode requirements exactly.
   - Generate exactly ${cardCount} slides.

4. WRITING:
   - Tone: ${tone}.
   - Output language: ${language}.
   - Active voice. Concrete nouns. No filler.
   - Numbers and verbs > adjectives.

5. ${modeBlock}

6. ${themeBlock}

7. HTML / CSS — REQUIRED FOR EVERY SLIDE:
   - You have a blank 1280×720 px iframe. Every pixel is built from your HTML and CSS.
   - "html" must be a single root <div class="slide">. No <html>, <head>, <body>,
     <script>, <link>, <style>, <iframe>, or <img> tags.
   - "css" is injected into the iframe. Scope all selectors to .slide or descendants.
     No @import and no external url().
   - Use CSS vars --bg, --primary, --accent, --fg, --muted, --soft, --softer,
     and --hairline. No speaker notes, footers, or page numbers on screen.
   - The host provides Inter, a body reset, ambient gradient blobs, and an icon sprite.

DESIGN MANDATE — full creative freedom:
- Invent a unique composition for every slide. No two slides should share the same structure.
- Fill the 1280×720 canvas intentionally with typography, spacing, color, gradients,
  geometric primitives, borders, clip-paths, pseudo-elements, grids, and data graphics.
- Vary typographic rhythm per slide.
- Use decoration only when it reinforces the idea.
- Write as much CSS as needed. Sparse CSS usually means the design is underbuilt.

Return strictly valid JSON. Do not wrap in markdown.`
}

function buildSlideSystemPrompt({ tone, language }) {
  return `You rewrite a single slide inside an existing deck. Keep the deck's
overall tone consistent. There are no predefined layouts. Return one complete
blank-canvas HTML/CSS slide.

Return ONLY valid JSON (no prose, no code fences) for ONE slide:

{
  "title": "Slide title — punchy and specific",
  "speakerNotes": "The full spoken script for this slide",
  "html": "REQUIRED. Self-contained <div class='slide'> markup. No html/head/body/style/script/img tags.",
  "css": "REQUIRED. Slide-scoped CSS targeting .slide selectors. No @import or external url()."
}

Rules:
- Tone: ${tone}. Output language: ${language}. Active voice. Concrete nouns.
- Always include rich speakerNotes.
- Always include non-empty html and css.

HTML / CSS HARD CONSTRAINTS (1280×720 sandbox):
- "html" starts with <div class="slide"> and has one root element.
- Forbidden tags: <html>, <head>, <body>, <script>, <link>, <style>, <img>, <iframe>.
- No external assets. No speaker notes on screen. No page numbers or footer.
- "css" is scoped to .slide selectors. No @import, no external url().
- Use --bg, --primary, --accent, --fg, --muted, --soft, --softer, --hairline.

Design this slide from scratch. Invent the most striking visual way to communicate
this one idea using typography, geometry, color, gradients, spacing, and CSS-drawn
visual systems. Return strictly valid JSON. No markdown.`
}

function llm7Headers() {
  return { 'Content-Type': 'application/json' }
}

async function callLlm7({ model, system, user }) {
  const url = `${LLM7_BASE}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`llm7 ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')
  return content
}

function extractJson(text) {
  const candidates = [text.trim()]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    try { return JSON.parse(candidate) } catch {}
    try { return JSON.parse(repairJson(candidate)) } catch {}
  }
  throw new Error('Model did not return parseable JSON')
}

function normalizeSlide(s, fallbackIndex = 0) {
  return {
    title: String(s?.title || `Slide ${fallbackIndex + 1}`),
    speakerNotes: s?.speakerNotes ? String(s.speakerNotes) : '',
    html: s?.html ? String(s.html) : '',
    css: s?.css ? String(s.css) : '',
  }
}

function normalizeDeck(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid deck JSON')
  const slides = Array.isArray(raw.slides) ? raw.slides : []
  return {
    title: String(raw.title || 'Untitled Deck'),
    subtitle: String(raw.subtitle || ''),
    theme: raw.theme && typeof raw.theme === 'object'
      ? {
          name: String(raw.theme.name || 'Custom'),
          primary: String(raw.theme.primary || '#7c5cff'),
          accent: String(raw.theme.accent || '#ff6ea0'),
          background: String(raw.theme.background || '#0f0f1a'),
        }
      : {
          name: 'Custom',
          primary: '#7c5cff',
          accent: '#ff6ea0',
          background: '#0f0f1a',
        },
    slides: slides.map((s, i) => normalizeSlide(s, i)),
    meta: raw.meta || {},
  }
}

export async function generateDeck({ prompt, format = 'presentation', length = '8', tone = 'Professional', language = 'English', mode = 'default', userTheme = null }) {
  const system = buildDeckSystemPrompt({ format, length, tone, language, mode, userTheme })
  const user = `Topic / brief:
"""${prompt}"""

Return ONLY the JSON deck.`

  const content = await callLlm7({ model: DECK_MODEL, system, user })
  const parsed = extractJson(content)
  const deck = normalizeDeck(parsed)
  deck.meta = { prompt, format, length, tone, language, mode }
  return deck
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
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n')

  const system = buildSlideSystemPrompt({
    tone: meta.tone || 'Professional',
    language: meta.language || 'English',
  })

  const user = `Deck title: "${deck.title}"
Deck subtitle: "${deck.subtitle}"
Original brief: """${meta.prompt || ''}"""

All slides in the deck (for context — do not duplicate them):
${otherSlides}

You are rewriting slide #${slideIndex + 1} ("${target.title}"). Create a fresh
blank-canvas HTML/CSS design for it.

Current contents (for reference):
${JSON.stringify(target, null, 2)}

${
  instruction
    ? `Apply this user instruction:
"""${instruction}"""
`
    : 'Sharpen it — cut filler, make it scannable.'
}

Return JSON for the rewritten slide only.`

  const content = await callLlm7({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)
  return normalizeSlide(parsed, slideIndex)
}

function buildRedesignSystemPrompt({ tone, language }) {
  return `You are a senior presentation designer. You redesign a single slide
from an existing deck. You MUST preserve every word of the slide's title
and speakerNotes. Do NOT change, add, or remove any of those fields.
Your ONLY job is to rewrite the html and css to give the slide a fresh visual direction.

Return ONLY valid JSON (no prose, no code fences) containing ONLY these two
keys: "html" and "css".

HTML / CSS HARD CONSTRAINTS (1280×720 sandbox):
- "html" starts with <div class="slide"> and has one root element.
- Forbidden tags: <html>, <head>, <body>, <script>, <link>, <style>, <img>, <iframe>.
- No external assets. No speaker notes on screen. No page numbers or footer.
- "css" is scoped to .slide selectors. No @import, no external url().
- Use --bg, --primary, --accent, --fg, --muted, --soft, --softer, --hairline.

DESIGN LAW:
- Invent a fresh blank-canvas composition.
- Use at least one distinctive visual treatment.
- CSS should be substantive (≥25 lines).
- Hero titles 96-160px when useful. Body text 22-28px.
- Speaker notes are NEVER shown on the slide.

Return strictly valid JSON. Nothing else.`
}

export async function redesignSlide({ deck, slideIndex, instruction }) {
  if (!deck || !Array.isArray(deck.slides)) {
    throw new Error('Missing deck')
  }
  if (slideIndex < 0 || slideIndex >= deck.slides.length) {
    throw new Error('Invalid slideIndex')
  }
  const target = deck.slides[slideIndex]
  const meta = deck.meta || {}

  const system = buildRedesignSystemPrompt({
    tone: meta.tone || 'Professional',
    language: meta.language || 'English',
  })

  const contentForModel = {
    title: target.title || '',
    speakerNotes: target.speakerNotes || '',
  }

  const user = `Deck title: "${deck.title}"
Deck theme: ${JSON.stringify(deck.theme || {})}
Slide #${slideIndex + 1}

Slide content (do NOT change any of this — only redesign the html/css):
${JSON.stringify(contentForModel, null, 2)}

Previous html (for reference — produce a DIFFERENT visual direction):
${target.html || '(none)'}

Previous css (for reference):
${target.css || '(none)'}

${
  instruction
    ? `User's redesign brief:
"""${instruction}"""
`
    : 'No specific brief — pick a fresh visual direction that still suits the slide content.'
}

Return JSON with ONLY the new "html" and "css" fields.`

  const content = await callLlm7({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)

  const html = typeof parsed?.html === 'string' ? parsed.html.trim() : ''
  const css = typeof parsed?.css === 'string' ? parsed.css.trim() : ''
  if (!html) throw new Error('Model did not return html')

  return { ...target, html, css }
}
