import { DeckStreamParser } from './streamParser.js'

const LLM7_BASE = process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1'

/**
 * Models served by llm7.io. The free tier exposes a small set of models
 * via the OpenAI-compatible `/chat/completions` endpoint without an API
 * key; richer models become available when `LLM7_API_KEY` is supplied.
 */
const DECK_MODEL = process.env.LLM7_DECK_MODEL || 'GLM-4.6V-Flash'
const SLIDE_MODEL = process.env.LLM7_SLIDE_MODEL || 'GLM-4.6V-Flash'

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
      "charts":    [{"type":"bar | line | pie","title":"≤ 4 words","data":[{"label":"≤ 3 words","value": 42}]}],
      "sectionLabel":"For 'section' layout: a 1-3 word section eyebrow",
      "imagePrompt":"1-sentence editorial photo description for this slide — concrete, evocative, NO text/logos/words in image. Used as bg for hero/section/statement and side panel for bullets/stats/quote/content.",
      "speakerNotes":"1 sentence (≤ 22 words) — the talking point a speaker says",
      "html": "Self-contained HTML for the slide body — see HTML/CSS RULES.",
      "css":  "Slide-scoped CSS — see HTML/CSS RULES."
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

4. FILL EVERY REQUIRED FIELD FOR THE LAYOUT — NO EMPTY OR PLACEHOLDER VALUES:
   - title         → title, body (acts as subtitle, 8-14 words)
   - section       → title, sectionLabel (1-3 words)
   - statement     → title (the headline sentence), body (≤ 14-word elaboration)
   - bullets       → title, bullets[3-5] (each ≤ 6 words, all distinct)
   - steps         → title, steps[3-5] (every entry has BOTH label and detail)
   - comparison    → title, comparison.leftLabel, leftItems[3], rightLabel, rightItems[3]
   - stats         → title, stats[3-4] (every entry has a real numeric value, no "TBD")
   - quote         → title, quote.text + quote.attribution (real-sounding name, role)
   - two-column    → title, body (≤ 18 words), bullets[3-5]
   - content       → title, body (≤ 18 words)

   EVERY slide MUST include speakerNotes. EVERY slide MUST include rich,
   non-empty html and css (see section 9). NEVER ship a slide where bullets,
   steps, or stats arrays are empty for a layout that needs them.

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

8. CHARTS (only when meaningful):
   - Add a "charts" array ONLY when the slide is genuinely about quantitative
     data the audience needs to see (trends, distributions, comparisons of
     numbers). Most slides have NO charts — leave the array empty or omit it.
   - Each chart: { "type": "bar" | "line" | "pie", "title": "≤ 4 words",
     "data": [ { "label": "≤ 3 words", "value": <number> }, ... ] }.
   - 3-6 data points. Values must be plain numbers (no "%" or "$" — keep
     formatting clean).
   - Charts auto-render inside the slide HTML wherever you place a
     <div data-chart="0"></div> placeholder (index = chart's array position).
   - Pair charts naturally with "stats", "comparison", or "two-column" layouts.

9. HTML / CSS — DESIGN A REAL SLIDE, NOT A WIREFRAME:

   The renderer gives you a 1280×720 sandboxed iframe with these CSS variables
   already defined: --bg (deep background), --primary, --accent, --fg (#fff),
   --muted (rgba white 65%). Default styles already cover h1/h2/h3/p/ul/li/
   blockquote at presentation sizes. Build ON TOP of those — don't reinvent
   them with smaller numbers.

   STRUCTURE RULES:
   - "html" MUST start with <div class="slide"> ... </div>. ONE root only.
     Inside, use real semantic markup: <h1>, <h2>, <p>, <ul><li>, <ol><li>,
     <blockquote>, <figure>, <figcaption>, <span>, <div>.
   - NO <html>, <head>, <body>, <script>, <link>, <style>, <img>, or <iframe>
     tags. NO external assets, NO @import, NO url(http…) in css.
   - The hero image is painted by the host frame BEHIND .slide. Do not
     reference it in html.
   - Speaker notes are NEVER shown on the slide.
   - Charts: drop <div data-chart="N"></div> where N is the chart index.
     The renderer replaces it with an inline SVG.

   VISUAL DESIGN RULES — every slide must FEEL like a designed slide:
   - Use BIG type. Hero numbers / titles 96-160px. Body text 22-28px.
   - Use the theme variables liberally: gradient backgrounds with
     color-mix(in oklab, var(--primary) X%, var(--bg)), accent borders,
     accent eyebrows ("01 / 04", "INSIGHT", "STEP 02", etc.).
   - Add at least ONE deliberate visual treatment per slide from this menu:
     numbered circles, accent vertical bars, decorative gradient blobs,
     pill-shaped tags, divider lines, oversized index numbers, subtle
     dotted/grid patterns via repeating-linear-gradient, glassy cards
     (background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
     border-radius: 24px; backdrop-filter: blur(12px)).
   - Layout with CSS grid or flexbox. Generous whitespace. Asymmetry beats
     dead-center boxes for non-title slides.
   - Maintain a clear visual hierarchy: eyebrow → headline → supporting body
     → details. Never let the supporting content be larger than the headline.

   PER-LAYOUT HTML SCAFFOLDS — adapt these, don't copy verbatim. Replace
   theme tokens to match the deck's mood; keep the structure.

   • title:
     <div class="slide title-slide">
       <span class="eyebrow">PRESENTATION</span>
       <h1>{slide title}</h1>
       <p class="lede">{body / subtitle}</p>
       <div class="meta-row"><span>{date or sector}</span><span>·</span><span>{author or label}</span></div>
     </div>

   • section:
     <div class="slide section-slide">
       <span class="section-index">{02}</span>
       <span class="section-eyebrow">{sectionLabel}</span>
       <h1>{slide title}</h1>
       <div class="accent-bar"></div>
     </div>

   • statement:
     <div class="slide statement-slide">
       <span class="quote-mark">“</span>
       <h1 class="statement">{slide title}</h1>
       <p class="elaboration">{body}</p>
     </div>

   • bullets:
     <div class="slide bullets-slide">
       <header><span class="eyebrow">KEY POINTS</span><h2>{slide title}</h2></header>
       <ul class="bullets">
         <li><span class="dot"></span><span class="text">{bullet}</span></li>
         …
       </ul>
     </div>

   • steps:
     <div class="slide steps-slide">
       <h2>{slide title}</h2>
       <ol class="steps">
         <li>
           <span class="step-num">01</span>
           <div class="step-body"><h3>{step.label}</h3><p>{step.detail}</p></div>
         </li>
         …
       </ol>
     </div>

   • comparison:
     <div class="slide comparison-slide">
       <h2>{slide title}</h2>
       <div class="cmp-grid">
         <section class="cmp-col cmp-left">
           <span class="cmp-label">{leftLabel}</span>
           <ul>{leftItems as <li>…</li>}</ul>
         </section>
         <section class="cmp-col cmp-right">
           <span class="cmp-label">{rightLabel}</span>
           <ul>{rightItems as <li>…</li>}</ul>
         </section>
       </div>
     </div>

   • stats:
     <div class="slide stats-slide">
       <header><span class="eyebrow">BY THE NUMBERS</span><h2>{slide title}</h2></header>
       <div class="stat-grid">
         <article class="stat-card"><div class="stat-value">{value}</div><div class="stat-label">{label}</div></article>
         …
       </div>
     </div>

   • quote:
     <div class="slide quote-slide">
       <span class="quote-mark">“</span>
       <blockquote>{quote.text}</blockquote>
       <footer><span class="rule"></span><cite>{quote.attribution}</cite></footer>
     </div>

   • two-column:
     <div class="slide two-col-slide">
       <header><span class="eyebrow">{tag}</span><h2>{slide title}</h2></header>
       <div class="cols">
         <div class="prose"><p>{body}</p></div>
         <ul class="bullets">{bullets as <li>…</li>}</ul>
       </div>
     </div>

   • content:
     <div class="slide content-slide">
       <span class="eyebrow">{tag}</span>
       <h2>{slide title}</h2>
       <p class="body">{body}</p>
     </div>

   CSS REQUIREMENTS — every slide ships at least 25 lines of slide-scoped CSS
   that styles its own layout. Always include rules for:
     - the root .slide variant (e.g. .slide.title-slide { ... }) with grid/flex,
       padding, background treatment, and gap.
     - any custom classes you used (.eyebrow, .stat-card, .step-num, .cmp-col,
       .accent-bar, .quote-mark, etc.).
     - hover/state polish only if it makes sense; otherwise just static styles.
   Use color-mix() for tinted accents. Use radial-gradient or linear-gradient
   on .slide::before for decorative depth where the layout allows.

   GOLDEN RULE: if you removed the body copy, the slide should still LOOK
   like a finished presentation slide because of the typography, spacing,
   and accent treatments alone. Empty-looking output is a failure.

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
  "charts":    [{"type":"bar | line | pie","title":"≤ 4 words","data":[{"label":"≤ 3 words","value": 42}]}],
  "sectionLabel":"...",
  "imagePrompt":"1-sentence editorial photo description (no text in image)",
  "speakerNotes":"1 sentence (≤ 22 words)",
  "html":"Self-contained <div class='slide'> markup — no <html>/<head>/<body>/<style>/<script> tags. Use --bg, --primary, --accent, --fg CSS vars. Place <div data-chart='N'></div> where each chart should appear. No <img> tags (host frame paints the hero image).",
  "css":"Slide-scoped CSS targeting .slide selectors. No @import or external url()."
}

Rules:
- Use the layout "${layout}" exactly. Fill EVERY field that layout requires —
  no empty arrays, no placeholder values like "TBD".
- Layout → required fields (must all be populated):
    title       → title, body (acts as subtitle, 8-14 words)
    section     → title, sectionLabel (1-3 words)
    statement   → title (the bold sentence), body (≤ 14-word elaboration)
    bullets     → title, bullets[3-5] (≤ 6 words each, all distinct)
    steps       → title, steps[3-5] (each entry has BOTH label and detail)
    comparison  → title, comparison{leftLabel, leftItems[3], rightLabel, rightItems[3]}
    stats       → title, stats[3-4] (each value is a real number/figure)
    quote       → title, quote{text, attribution with name + role}
    two-column  → title, body (≤ 18 words), bullets[3-5]
    content     → title, body (≤ 18 words)
- Word caps are hard. Apply the 5/5/5 rule.
- Active voice. Concrete nouns. No filler.
- Tone: ${tone}.
- Output language: ${language}.
- Always include a one-sentence "speakerNotes" (≤ 22 words).
- Always include "imagePrompt" UNLESS layout is "steps" or "comparison".

HTML / CSS — DESIGN A REAL SLIDE, NOT A WIREFRAME (1280×720 sandbox):
- Use the host CSS vars: --bg, --primary, --accent, --fg (#fff), --muted.
  Do NOT redefine the global font sizes for h1/h2/h3/p/li — host already
  provides presentation-scale defaults; you can override per slide variant.
- "html" starts with <div class="slide ${layout}-slide"> ... </div>. Use
  semantic markup (h1/h2/p/ul/li/blockquote/figure/cite). Forbidden tags:
  <html><head><body><script><link><style><img><iframe>. No external assets.
- Pick at least ONE deliberate visual treatment from this menu:
    eyebrow tag (uppercase, letter-spaced, accent color),
    big index number ("01", "02"…) or step circle,
    accent vertical bar / divider rule,
    glassy card (background: rgba(255,255,255,0.04); border: 1px solid
       rgba(255,255,255,0.08); border-radius: 24px; padding: 28-40px),
    gradient halo via .slide::before with radial/linear gradients in
       color-mix(in oklab, var(--primary) 35%, transparent),
    pill-shaped tags, oversized opening quote mark, asymmetric grid.
- Layout the slide with CSS grid or flexbox. Generous whitespace. Avoid
  centered-everything-in-a-box wireframes for non-title slides.
- Hero numbers / titles 96-160px. Body 22-28px. Maintain hierarchy:
  eyebrow → headline → supporting body → details.
- "css" must be slide-scoped (.slide ... selectors), at least 25 lines,
  styling the layout's wrapper, eyebrow/index, body type, and any custom
  classes you used. Include a decorative .slide::before treatment when
  the layout has room. No @import, no url(http…).
- Charts: include <div data-chart="N"></div> placeholders where they
  belong; the renderer fills them in.
- Hero image is painted by the host frame BEHIND the slide — never embed
  <img> tags. Speaker notes never appear in HTML.

Return strictly valid JSON. No markdown.`
}

function llm7Headers() {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LLM7_API_KEY) {
    headers.Authorization = `Bearer ${process.env.LLM7_API_KEY}`
  }
  return headers
}

async function callLlm7({ model, system, user }) {
  const url = `${LLM7_BASE}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({
      model,
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
    charts: Array.isArray(s?.charts)
      ? s.charts
          .map((c) => ({
            type: ['bar', 'line', 'pie'].includes(c?.type) ? c.type : 'bar',
            title: c?.title ? String(c.title) : '',
            data: Array.isArray(c?.data)
              ? c.data
                  .map((d) => ({
                    label: String(d?.label ?? ''),
                    value: Number(d?.value),
                  }))
                  .filter((d) => Number.isFinite(d.value))
              : [],
          }))
          .filter((c) => c.data.length > 0)
      : [],
    html: s?.html ? String(s.html) : '',
    css: s?.css ? String(s.css) : '',
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
  const content = await callLlm7({ model: DECK_MODEL, system, user })
  const parsed = extractJson(content)
  return normalizeDeck(parsed, ctx)
}

/**
 * Streaming variant. Calls llm7 with the same prompt as generateDeck but
 * forwards meta + each completed slide as it parses out of the model's stream.
 */
export async function streamGenerateDeck(ctx, handlers = {}) {
  const system = buildDeckSystemPrompt(ctx)
  const user = `Topic / brief:\n"""${ctx.prompt}"""\n\nGenerate the deck JSON now.`

  const upstream = await fetch(`${LLM7_BASE}/chat/completions`, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({
      model: DECK_MODEL,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`llm7 ${upstream.status}: ${text.slice(0, 300)}`)
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
      if (payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload)
        if (obj.error) {
          throw new Error(obj.error.message || obj.error || 'AI error')
        }
        const delta = obj?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          raw += delta
          emit(parser.feed(delta))
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

  const content = await callLlm7({ model: SLIDE_MODEL, system, user })
  const parsed = extractJson(content)
  // Keep the requested layout — don't let the model swap it.
  return normalizeSlide({ ...parsed, layout: target.layout }, slideIndex)
}
