import { DeckStreamParser } from './streamParser.js'
import { repairJson } from './jsonRepair.js'

import { DECK_MODEL, SLIDE_MODEL, llmHeaders, llmUrl, llmError, assertLlmKey } from './llm.js'
import { parseLength } from '../src/lib/pricing.js'

/**
 * Content-depth modes for presentations. Each mode tweaks the word budgets
 * and per-slide richness so the same prompt can produce a punchy keynote
 * deck or a more detailed sales-pitch deck.
 */
const MODE_RULES = {
  concise: `MODE: CONCISE — every slide is a punchy headline. Brevity is the goal.
   - On-screen content is short, sharp, and visual-first.
   - Speaker notes: one short cue sentence — the single thing the presenter says.
   - On-screen text feels like newspaper headlines, not explanations.`,

  default: `MODE: DEFAULT — rich, fully substantive slides that are ready to present.
   Every field must be filled with real, meaningful content. Sparse output is a failure.

   On-slide content:
   - html and css must contain real, substantive content: punchy titles, meaningful body text, and visual hierarchy.
   - Speaker notes: 2-3 sentences. The talking point the presenter says out loud —
     NOT a restatement of what's on screen. Add evidence, context, or story.`,

  detailed: `MODE: DETAILED — produce the richest, most substantive deck possible.
   Every slide must feel complete and polished, ready for a live presentation.
   Sparse or thin output is a failure — write to the fullest.

   On-slide content (all conveyed through html/css):
   - html must contain full substantive text: punchy titles, framing sentences, data points, quotes, and visual hierarchy.
   - css must bring the design to life with typography, spacing, color, and layout.
   - Speaker notes (the full spoken script for this slide):
     4-6 sentences of natural spoken English, first person.
     ("Here's the key insight…", "What this means in practice…", "Notice that…")
     Open with a transition or hook that connects from the previous slide.
     Spend the majority explaining the evidence, data, or story behind what's on screen —
     the substance the audience WON'T see.
     Close with a clear takeaway or a bridge to the next slide.
     NEVER restate the on-screen text. Always add depth and substance behind it.`,
}

function buildDeckSystemPrompt({ length, tone, language, mode = 'default', userTheme = null }) {
  const cardCount = parseLength(length)
  const modeBlock = MODE_RULES[mode] || MODE_RULES.default

  const themeBlock = userTheme && userTheme.primary
    ? `THEME — USER HAS SELECTED A SPECIFIC THEME. You MUST use exactly these colors:
- "background": "${userTheme.background}"
- "primary":    "${userTheme.primary}"
- "accent":     "${userTheme.accent}"
- "name":       "${userTheme.name || 'Custom'}"
All CSS must use var(--bg), var(--primary), var(--accent), var(--fg), and var(--muted); do not hardcode alternate palette hex values.`
    : `THEME:
- Pick a cohesive palette that matches the topic and tone.
- "background" should be a deep, low-saturation color.
- "primary" and "accent" should be vivid and harmonize with each other.
- All CSS must use var(--bg), var(--primary), var(--accent), var(--fg), and var(--muted) for theme colors.`

  return `You are a senior presentation designer drafting a slide-based presentation deck.
You have a blank 1280x720 canvas for every slide. There are no predefined
layouts, templates, layout names, or host-rendered slide components. Each
slide is self-contained HTML/CSS that you design from scratch with full
creative freedom.

Return ONLY valid JSON (no prose, no code fences). Output this shape:

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
      "speakerNotes": "What the presenter says out loud — the full spoken script for this slide",
      "html": "REQUIRED. Self-contained HTML for the slide body. Must start with <div class='slide'>.",
      "css": "REQUIRED. Slide-scoped CSS targeting .slide and descendants."
    }
  ]
}

DESIGN LAW — follow strictly:

1. ONE IDEA PER SLIDE. If you have two ideas, make two slides.

2. BLANK CANVAS ONLY. Do not choose or reference a predefined layout. Invent
   a custom composition for each slide using only the html/css fields.

3. CONTENT DEPTH — write rich, substantive content in every slide:
   - html/css must contain all on-screen text and visual design.
   - Speaker notes: follow the mode requirements exactly and add presenter-only
     depth that is not merely restating the screen.

4. WRITING:
   - Tone: ${tone}.
   - Output language: ${language}.
   - Active voice. Concrete nouns. No filler ("In this slide…", "We will discuss…").
   - Numbers and verbs > adjectives. Show, don't narrate.
   - Generate exactly ${cardCount} slides.

5. ${modeBlock}

6. ${themeBlock}

7. HTML / CSS — REQUIRED FOR EVERY SLIDE:
   - You have a blank 1280×720 px iframe. Every pixel of the slide is built from
     your HTML and CSS. There is no background photo and no external asset layer.
   - "html" must be a single root <div class="slide"> (you may add extra classes).
     No <html>, <head>, <body>, <script>, <link>, <style>, <iframe>, or <img> tags.
   - "css" is injected into the iframe. Scope all selectors to .slide or descendants.
     No @import and no external url().
   - Use CSS vars --bg, --primary, --accent, --fg, --muted, --soft, --softer,
     and --hairline. No speaker notes, footers, or page numbers on screen.
   - The host provides Inter, a body reset, ambient gradient blobs, an icon sprite,
     chart replacement, and an automatic footer.

DESIGN MANDATE — full creative freedom, zero templates:
- Invent a unique composition for every slide. No two slides should share the same structure.
- Fill the 1280×720 canvas intentionally with typography, spacing, color, gradients,
  geometric primitives, borders, clip-paths, pseudo-elements, grids, and data graphics.
- Vary typographic rhythm per slide. Some slides can use a 110px hero word; others
  can use dense 14px labels around a visual system.
- Use decoration only when it reinforces the idea. Avoid generic card grids by default.
- Write as much CSS as needed. Sparse CSS usually means the design is underbuilt.

Return strictly valid JSON. Do not wrap in markdown.`
}

function buildSlideSystemPrompt({ tone, language }) {
  return `You rewrite a single slide inside an existing deck. Keep the deck's
overall tone consistent. There are no predefined layouts. Return one complete
blank-canvas HTML/CSS slide.

Return ONLY valid JSON (no prose, no code fences) for ONE slide, matching:

{
  "speakerNotes": "The full spoken script for this slide — evidence and context not shown on screen",
  "html": "REQUIRED. Self-contained <div class='slide'> markup. No html/head/body/style/script/img tags.",
  "css": "REQUIRED. Slide-scoped CSS targeting .slide selectors. No @import or external url()."
}

Rules:
- Tone: ${tone}. Output language: ${language}. Active voice. Concrete nouns.
- Always include rich speakerNotes. Do not restate on-screen text.
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

async function callLlm7({ model, system, user }) {
  assertLlmKey()
  const url = llmUrl('/chat/completions')
  const res = await fetch(url, {
    method: 'POST',
    headers: llmHeaders(),
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
    throw llmError(res.status, text)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')
  return content
}


function extractJson(text) {
  const candidates = [text.trim()]
  // Also try the content of a fenced code block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  // Also try just the outermost { … } span
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    // Try raw parse first
    try { return JSON.parse(candidate) } catch {}
    // Try with repair
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

function normalizeDeck(raw, ctx) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid deck object')
  const slides = Array.isArray(raw.slides) ? raw.slides : []
  if (slides.length === 0) throw new Error('Deck has no slides')

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
    meta: {
      model: DECK_MODEL,
      prompt: ctx.prompt,
      length: ctx.length,
      tone: ctx.tone,
      language: ctx.language,
      mode: ctx.mode || 'default',
      generatedAt: new Date().toISOString(),
    },
  }
}

function buildUserMessage(prompt) {
  return `Topic / brief:
"""${prompt}"""

Generate the deck JSON now.

CRITICAL CONTENT RULES — failure to follow these is unacceptable:
- Slide titles must be punchy and specific. No vague labels like "Introduction" or "Overview".
- Every slide's html must contain real, substantive on-screen text and visual design.
- Speaker notes must be rich and presenter-focused — not a restatement of what's on screen.
- Every slide MUST include non-empty "html" and "css" fields for a blank 1280x720 canvas.
- Write the actual substance — assume the reader has never heard of this topic before.`
}

export async function generateDeck(ctx) {
  const system = buildDeckSystemPrompt(ctx)
  const user = buildUserMessage(ctx.prompt)
  const content = await callLlm7({ model: DECK_MODEL, system, user })
  const parsed = extractJson(content)
  return normalizeDeck(parsed, ctx)
}

/**
 * Streaming variant. Calls the provider with the same prompt as generateDeck but
 * forwards meta + each completed slide as it parses out of the model's stream.
 */
export async function streamGenerateDeck(ctx, handlers = {}) {
  const system = buildDeckSystemPrompt(ctx)
  const user = buildUserMessage(ctx.prompt)

  const upstream = await fetch(llmUrl('/chat/completions'), {
    method: 'POST',
    headers: llmHeaders(),
    body: JSON.stringify({
      model: DECK_MODEL,
      stream: true,
      max_tokens: 32000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw llmError(upstream.status, text)
  }

  const parser = new DeckStreamParser()
  let raw = ''
  let pending = ''
  // Collect normalized slides as they stream so we can use them as a
  // fallback if the final extractJson(raw) fails.
  const streamedSlides = []
  // Capture streamed meta for the fallback path.
  let streamedMeta = null

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()

  const emit = (events) => {
    for (const ev of events) {
      if (ev.type === 'meta') {
        streamedMeta = ev.meta
        handlers.onMeta?.(ev.meta)
      } else if (ev.type === 'partial') {
        handlers.onPartial?.({ index: ev.index, partial: ev.partial })
      } else if (ev.type === 'slide') {
        const normalized = normalizeSlide(ev.slide, ev.index)
        streamedSlides.push(normalized)
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
      if (payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload)
        if (obj.error) {
          throw new Error(obj.error.message || obj.error || 'AI error')
        }
        // Some models expose reasoning tokens in a separate field
        const reasoning = obj?.choices?.[0]?.delta?.reasoning_content
        if (typeof reasoning === 'string' && reasoning) {
          handlers.onThinking?.({ text: reasoning, type: 'reasoning' })
        }
        const delta = obj?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          raw += delta
          emit(parser.feed(delta))
          // Stream raw tokens as "thinking" so the client can show them live
          handlers.onThinking?.({ text: delta, type: 'content' })
        }
      } catch (e) {
        if (e?.message && !/Unexpected token|in JSON at/.test(e.message)) {
          throw e
        }
      }
    }
  }

  if (!raw) throw new Error('Empty response from model')
  let parsed
  try {
    parsed = extractJson(raw)
  } catch (err) {
    // The final full-text parse failed — usually because the model output
    // was too large or contained an unrepairable malformation. If the
    // DeckStreamParser already emitted slides during streaming, we can
    // return a deck built from those instead of crashing.
    if (parser.slidesEmitted === 0) {
      throw new Error(`Failed to parse model JSON: ${err.message}`)
    }
    // The client already received slide events via SSE, so the deck is
    // usable. Build a minimal deck object so normalizeDeck() succeeds.
    // The slides array will be repopulated from the stream events that
    // were already sent — this return value is for the final `done` SSE
    // event and for the server-side DB persist.
    console.warn(`[generate-deck] extractJson failed (${err.message}), falling back to ${streamedSlides.length} streamed slides`)
    // streamedSlides are already normalized — skip normalizeDeck() to avoid
    // double-processing. Build the final deck object directly, using
    // whatever meta the stream parser already captured.
    return {
      title: String(streamedMeta?.title || 'Untitled Deck'),
      subtitle: String(streamedMeta?.subtitle || ''),
      theme: streamedMeta?.theme || {
        name: 'Custom',
        primary: '#7c5cff',
        accent: '#ff6ea0',
        background: '#0f0f1a',
      },
      slides: streamedSlides,
      meta: {
        model: DECK_MODEL,
        prompt: ctx.prompt,
        length: ctx.length,
        tone: ctx.tone,
        language: ctx.language,
        mode: ctx.mode || 'default',
        generatedAt: new Date().toISOString(),
      },
    }
  }
  return normalizeDeck(parsed, ctx)
}

function buildRedesignSystemPrompt({ tone, language }) {
  return `You are a senior presentation designer redesigning the VISUAL TREATMENT
of one slide while keeping its speakerNotes IDENTICAL.

You are a strict JSON-only assistant. Return ONLY a JSON object — no prose,
no code fences, no commentary — matching exactly:

{
  "html": "<div class=\\"slide\\"> … </div>",
  "css":  ".slide { … } /* slide-scoped, no @import, no external url() */"
}

What "redesign" means here:
- Same speakerNotes. Do NOT rewrite the speakerNotes.
- Brand-new VISUAL DIRECTION for the html and css: change the layout
  composition, the accent treatments, the typography rhythm, the use of
  gradients/cards/dividers/index numbers — bring a meaningfully different
  feel from the previous markup.
- Stay within the deck's tone (${tone}) and language (${language}).

HARD CONSTRAINTS (1280×720 sandbox):
- "html" starts with <div class="slide"> ... </div>. ONE root.
- Use semantic markup: <h1>, <h2>, <p>, <ul><li>, <ol><li>, <blockquote>,
  <figure>, <figcaption>, <span>, <div>, <cite>.
- Forbidden tags: <html>, <head>, <body>, <script>, <link>, <style>,
  <img>, <iframe>. No external assets. No @import. No url(http…).
- Use the host CSS vars liberally: --bg, --primary, --accent, --fg (#fff),
  --muted. Default h1/h2/p/li sizes already render at presentation scale —
  override per the slide variant where needed.
- Speaker notes are NEVER shown on the slide.

VISUAL DESIGN MENU — pull at least ONE distinctive treatment that differs
from a typical centered wireframe:
  oversized index numbers ("01", "02"…), eyebrow tags (uppercase,
  letter-spaced, accent colored), accent vertical bars, divider rules with
  small caps, glassy cards (rgba(255,255,255,0.04) + 1px border + radius
  20-28px + optional backdrop-filter: blur(12px)), gradient halos via
  .slide::before with radial/linear gradients in
  color-mix(in oklab, var(--primary) X%, transparent), pill-shaped tags,
  stepped numbered circles, pull-quote marks, asymmetric grids.

CSS REQUIREMENTS:
- Slide-scoped selectors only (start with .slide…).
- At least 25 lines covering wrapper layout, eyebrow/index, hierarchy, and
  any custom classes you used.
- Hero numbers/titles 96-160px when useful. Body text 22-28px.
- Prefer a fresh blank-canvas composition over centered default layouts.

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
    speakerNotes: target.speakerNotes || '',
  }

const user = `Slide #${slideIndex + 1}

Slide content (do NOT change the speakerNotes — only redesign the html/css):
${JSON.stringify(contentForModel, null, 2)}

Previous html (for reference — produce a DIFFERENT visual direction):
${target.html || '(none)'}

Previous css (for reference):
${target.css || '(none)'}

${
  instruction
    ? `User's redesign brief:\n"""${instruction}"""\n`
    : 'No specific brief — pick a fresh visual direction that still suits the slide content.'
}

Return JSON with ONLY the new "html" and "css" fields.`

  const content = await callLlm7({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)

  const html = typeof parsed?.html === 'string' ? parsed.html.trim() : ''
  const css = typeof parsed?.css === 'string' ? parsed.css.trim() : ''
  if (!html) throw new Error('Model did not return html')

  // Merge: keep ALL existing content fields, swap only html + css.
  return { ...target, html, css }
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

  const system = buildSlideSystemPrompt({
    tone: meta.tone || 'Professional',
    language: meta.language || 'English',
  })

  const user = `Original brief: """${meta.prompt || ''}"""

You are rewriting slide #${slideIndex + 1}. Create a fresh
blank-canvas HTML/CSS design for it.

Current contents (for reference):
${JSON.stringify(target, null, 2)}

${
  instruction
    ? `Apply this user instruction:\n"""${instruction}"""\n`
    : 'Sharpen it — cut filler, make it scannable, hit the word caps.'
}

Return JSON for the rewritten slide only.`

  const content = await callLlm7({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)
  return normalizeSlide(parsed, slideIndex)
}

function buildEditSystemPrompt() {
  return `You are an expert slide editor applying TARGETED edits to ONE slide's
html and css. You are given the current html and css plus a user instruction.

You are a strict JSON-only assistant. Return ONLY a JSON object — no prose,
no code fences, no commentary — in ONE of these two shapes:

1) TARGETED EDITS (preferred — use whenever the change is localized):
{
  "ops": [
    {
      "target": "html" | "css",
      "search_block": "exact text copied verbatim from the current html/css",
      "replace_block": "the replacement text"
    }
  ],
  "notes": "one short sentence describing what changed"
}

Rules for ops:
- search_block must be copied EXACTLY from the current code, character for
  character (whitespace included), and must be long enough to be UNIQUE in
  its target field — it must occur exactly once.
- Use as few ops as possible. Ops apply in order.
- An empty replace_block deletes the search_block.
- You may add new css by appending: search for the last css rule and extend it.

2) FULL REPLACEMENT (only when the instruction requires rewriting most of
   the slide — e.g. a new layout direction):
{
  "html": "<div class='slide s2'> … </div>",
  "css":  ".slide { … }",
  "notes": "one short sentence describing what changed"
}

HARD CONSTRAINTS (1280×720 sandbox):
- html keeps ONE root: the SAME root div the slide already has (e.g.
  <div class='slide s2'>). Copy its attributes and quote style exactly —
  never rename or requote it.
- Use semantic markup only: <h1>, <h2>, <p>, <ul><li>, <ol><li>,
  <blockquote>, <figure>, <figcaption>, <span>, <div>, <cite>.
- Forbidden tags: <html>, <head>, <body>, <script>, <link>, <style>,
  <img>, <iframe>. No external assets. No @import. No url(http…).
- Keep using the host CSS vars: --bg, --primary, --accent, --fg, --muted.
- css selectors stay slide-scoped (start with .slide…).
- Do NOT change speakerNotes — they are not part of html/css.
- Preserve everything the user did NOT ask to change: wording, structure,
  classes, visual treatments.

Return strictly valid JSON. Nothing else.`
}

function assertSlideRoot(html) {
  if (!/<div\b[^>]*class=(['"])[^'"]*\bslide\b[^'"]*\1/i.test(html)) {
    throw new Error('edited html lost its slide root div (class="slide …")')
  }
}

function applyEditOps(slide, ops) {
  let html = slide.html || ''
  let css = slide.css || ''
  ops.forEach((op, i) => {
    if (!op || typeof op !== 'object') {
      throw new Error(`op ${i + 1}: not an object`)
    }
    const target = op.target
    if (target !== 'html' && target !== 'css') {
      throw new Error(`op ${i + 1}: target must be "html" or "css"`)
    }
    const search = String(op.search_block ?? '')
    const replace = String(op.replace_block ?? '')
    if (!search) throw new Error(`op ${i + 1}: empty search_block`)
    const current = target === 'html' ? html : css
    const first = current.indexOf(search)
    if (first === -1) {
      throw new Error(
        `op ${i + 1}: search_block not found in ${target} (starts with: ${JSON.stringify(search.slice(0, 80))})`
      )
    }
    if (current.indexOf(search, first + 1) !== -1) {
      throw new Error(`op ${i + 1}: search_block matches multiple times in ${target} — make it more specific`)
    }
    const next = current.slice(0, first) + replace + current.slice(first + search.length)
    if (target === 'html') html = next
    else css = next
  })
  return { html, css }
}

export async function editSlide({ deck, slideIndex, instruction }) {
  if (!deck || !Array.isArray(deck.slides)) {
    throw new Error('Missing deck')
  }
  if (slideIndex < 0 || slideIndex >= deck.slides.length) {
    throw new Error('Invalid slideIndex')
  }
  if (!instruction || !instruction.trim()) {
    throw new Error('Missing instruction')
  }
  const target = deck.slides[slideIndex]
  const system = buildEditSystemPrompt()

  const user = `Slide #${slideIndex + 1} of deck "${deck.title || 'Untitled'}".

Current html:
"""${target.html || ''}"""

Current css:
"""${target.css || ''}"""

User instruction:
"""${instruction.trim()}"""

Return JSON — targeted "ops" if possible, else full "html"+"css" replacement.`

  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? user
        : `${user}

Your previous response failed to apply: ${lastErr.message}
Return corrected JSON. search_block values must be copied EXACTLY from the
current html/css above.`
    const content = await callLlm7({ model: SLIDE_MODEL, system, user: prompt })
    const parsed = extractJson(content)

    // Full-replacement shape
    if (typeof parsed?.html === 'string' && parsed.html.trim()) {
      const html = parsed.html.trim()
      assertSlideRoot(html)
      return {
        slide: {
          ...target,
          html,
          css: typeof parsed.css === 'string' ? parsed.css.trim() : target.css || '',
        },
        notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      }
    }

    // Targeted-ops shape
    if (Array.isArray(parsed?.ops) && parsed.ops.length > 0) {
      try {
        const { html, css } = applyEditOps(target, parsed.ops)
        assertSlideRoot(html)
        return {
          slide: { ...target, html, css },
          notes: typeof parsed.notes === 'string' ? parsed.notes : '',
        }
      } catch (err) {
        lastErr = err
        continue
      }
    }

    lastErr = new Error('model returned neither "ops" nor "html"')
  }
  throw new Error(
    `Could not apply that edit (${lastErr?.message || 'unknown error'}). Try rephrasing the instruction.`
  )
}
