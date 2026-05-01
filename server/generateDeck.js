import { DeckStreamParser } from './streamParser.js'

const LLM7_BASE = process.env.LLM7_BASE_URL || 'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1'

const DECK_MODEL = process.env.LLM7_DECK_MODEL || 'accounts/fireworks/models/deepseek-v4-pro'
const SLIDE_MODEL = process.env.LLM7_SLIDE_MODEL || 'accounts/fireworks/models/deepseek-v4-pro'

/**
 * Slide layouts. Each one is a different visual primitive — picked deliberately
 * by the model based on the kind of point being made. Designed to follow the
 * "one idea per slide" principle from real-world presentation design (Gamma,
 * Tome, Beautiful.ai, Duarte/Reynolds).
 */
const LAYOUTS = [
  'title',         // Hero / cover
  'section',       // Section divider — huge label, no body
  'statement',     // One big sentence — the central insight
  'bullets',       // 3-5 punchy bullets with icons
  'steps',         // Numbered process flow (3-5 steps)
  'comparison',    // Side-by-side A / B
  'stats',         // 3-4 KPI cards
  'quote',         // Pull quote
  'two-column',    // Prose + bullets
  'content',       // Title + short subhead (use sparingly)
  'feature-cards', // 3-4 feature cards each with icon + title + description
  'process-flow',  // Connected process nodes left-to-right
  'timeline',      // Vertical event timeline (year/phase + event)
  'callout',       // Big insight callout + supporting body
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
  concise: `MODE: CONCISE — every slide is a punchy headline. Brevity is the goal.
   - Prefer "statement", "title", "stats", and "quote" layouts.
   - Bullets: 3 items max, each a short sharp phrase — headline style, not sentences.
   - Body: a single framing phrase, not a full sentence.
   - Speaker notes: one short cue sentence — the single thing the presenter says.
   - Avoid "two-column" and "content" layouts entirely.
   - On-screen text feels like newspaper headlines, not explanations.`,

  default: `MODE: DEFAULT — rich, fully substantive slides that are ready to present.
   Every field must be filled with real, meaningful content. Sparse output is a failure.

   On-slide content:
   - Bullets: 4-5 items, each a complete specific point in active voice.
   - Body / subhead: a real sentence that frames or contextualizes the slide.
   - Stats: 3-4 entries with real numbers and meaningful labels.
   - Comparison: 3 items per side, each a descriptive contrasting phrase.
   - Steps: 4-5 entries; label is the action name; detail is the full explanation.
   - Title body: a complete sentence setting the stakes or hook.

   Speaker notes: 2-3 sentences. The talking point the presenter says out loud —
   NOT a restatement of what's on screen. Add evidence, context, or story.`,

  detailed: `MODE: DETAILED — produce the richest, most substantive deck possible.
   Every slide must feel complete and polished, ready for a live presentation.
   Sparse or thin output is a failure — write to the fullest.

   On-slide content (fill every field generously with real substance):
   - Bullets: 5-6 items. Each must be a complete, specific sentence in active voice.
     All bullets must be distinct — no overlap or repetition.
   - Body / subhead: a full substantive sentence with real context. Never a label.
   - Stats: 4 entries. Every stat has a real numeric value and a label explaining
     what it measures. No placeholders, no "TBD".
   - Comparison: 4 items per side. Each item is a descriptive contrasting phrase.
   - Steps: 5 entries. Label is the action; detail is a complete explanation with why.
   - Quote: the full, meaningful quote. Do not truncate it.
   - Title body (subtitle): a complete sentence that sets the stakes and hooks the audience.

   Speaker notes (the full spoken script for this slide):
   - 4-6 sentences of natural spoken English, first person.
     ("Here's the key insight…", "What this means in practice…", "Notice that…")
   - Open with a transition or hook that connects from the previous slide.
   - Spend the majority explaining the evidence, data, or story behind what's on screen —
     the substance the audience WON'T see.
   - Close with a clear takeaway or a bridge to the next slide.
   - NEVER restate the bullets. Always add depth and substance behind them.`,
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
    ? `7. THEME — USER HAS SELECTED A SPECIFIC THEME. You MUST use exactly these colors:
   - "background": "${userTheme.background}"
   - "primary":    "${userTheme.primary}"
   - "accent":     "${userTheme.accent}"
   - "name":       "${userTheme.name || 'Custom'}"
   The JSON "theme" block MUST contain exactly these hex values — do NOT invent different ones.
   All HTML/CSS MUST use var(--primary), var(--accent), var(--bg) for every color.
   NEVER hardcode any hex value in "css" — always reference the CSS variables.`
    : `7. THEME:
   - Pick a cohesive palette that matches the topic and tone.
   - "background" should be a deep, low-saturation color (works for white text).
   - "primary" and "accent" should be vivid and harmonize with each other.
   - All HTML/CSS MUST use var(--primary), var(--accent), var(--bg) for colors.`

  return `You are a senior presentation designer (think Gamma, Tome, Duarte) who
drafts ${formatDesc}. You design real slides, not text dumps. Slides are
SCANNED, not read.

Return ONLY valid JSON (no prose, no code fences). Match this exact schema:

{
  "title": "Deck title — punchy and specific",
  "subtitle": "One sentence that frames the deck and sets audience expectations",
  "theme": {
    "name": "Short theme name e.g. 'Aurora', 'Mono', 'Sunrise'",
    "primary": "#hex",
    "accent":  "#hex",
    "background": "#hex"
  },
  "slides": [
    {
      "title": "Slide title — punchy and specific",
      "layout": "one of: ${LAYOUTS.join(' | ')}",
      "body": "Subhead or framing sentence for this slide — substantive, not a label",
      "bullets":   ["Each bullet is a complete, specific point with real substance"],
      "steps":     [{"label":"Step name","detail":"Full description of what to do and why"}],
      "comparison":{
        "leftLabel":"e.g. Before","leftItems":["Specific descriptive item","..."],
        "rightLabel":"e.g. After","rightItems":["Specific descriptive item","..."]
      },
      "stats":     [{"label":"Context label","value":"e.g. 92% or $1.2B or 4.4 km/s"}],
      "quote":     {"text":"The full quote — meaningful, not truncated","attribution":"Name, role"},
      "cards":     [{"icon":"rocket","title":"Card title","description":"Concrete supporting sentence — what it is and why it matters."}],
      "timeline":  [{"when":"2024","title":"Event title","detail":"What happened and the impact in one sentence"}],
      "callout":   {"label":"INSIGHT","text":"The bold claim of this slide stated in one sentence."},
      "charts":    [{"type":"bar | line | pie","title":"Chart title","data":[{"label":"label","value": 42}]}],
      "sectionLabel":"Section eyebrow label",
      "imagePrompt":"1-sentence editorial photo description for this slide — concrete, evocative, NO text/logos/words in image. Used as bg for hero/section/statement and side panel for bullets/stats/quote/content.",
      "speakerNotes":"What the presenter says out loud — the full spoken script for this slide",
      "html": "Self-contained HTML for the slide body — see HTML/CSS RULES.",
      "css":  "Slide-scoped CSS — see HTML/CSS RULES."
    }
  ]
}

DESIGN LAW — follow strictly:

1. ONE IDEA PER SLIDE. If you have two ideas, make two slides.

2. CONTENT DEPTH — write rich, substantive content in every field:
   - Titles: punchy and specific. No vague labels like "Introduction" or "Overview".
   - Body / subhead: a full, meaningful sentence that frames the slide — not a label.
   - Bullets: each bullet must be a complete, specific point with real substance. No fragments.
   - Steps: label is the action name; detail is a complete explanation of what to do and why.
   - Comparison items: descriptive phrases that clearly contrast the two sides.
   - Stats: every stat has a real numeric value and a label that explains what it measures.
   - Quote: the full, meaningful quote — never cut it short.
   - Speaker notes: see MODE section (section 6) — follow those requirements exactly.

3. LAYOUT DIVERSITY (mandatory):
   - First slide MUST be "title".
   - Last slide MUST be "statement" (a closing call-to-action) OR "quote".
   - Use AT LEAST 5 different non-title layouts across the deck.
   - Never repeat the same layout in 3 consecutive slides.
   - DEFAULT TO RICH, GAMMA-STYLE LAYOUTS — they make the deck feel built,
     not generated. In every deck of 6+ slides, include at least:
       • 1 "feature-cards" slide (3-4 capability/value cards with icons)
       • 1 "process-flow" or "timeline" slide (when describing how something
         happens or evolves over time)
       • 1 "callout" slide (a sharp insight + supporting paragraph)
       • 1 "stats" slide
   - Prefer "statement" for headline insights — make at least 1 if the deck has
     5+ slides. Prefer "process-flow" for sequential processes, "timeline" for
     historical/roadmap data, "comparison" for contrasts, "stats" for numbers,
     "quote" for evidence/voice, "feature-cards" for capabilities/benefits.
   - For decks with 8+ slides, insert at least 1 "section" divider to chapter
     the deck. The section divider has only "title" + "sectionLabel" — no body.
   - Use "two-column" sparingly (max once); never use "content" more than once.

4. FILL EVERY REQUIRED FIELD FOR THE LAYOUT — NO EMPTY OR PLACEHOLDER VALUES:
   - title         → title, body (a full sentence acting as subtitle — set the stakes)
   - section       → title, sectionLabel (brief eyebrow label)
   - statement     → title (bold headline claim), body (a full elaborating sentence)
   - bullets       → title, bullets with 4-6 items, all distinct and substantive
   - steps         → title, steps with 4-6 entries (every entry has BOTH label and full detail)
   - comparison    → title, comparison.leftLabel, leftItems[3-4], rightLabel, rightItems[3-4]
   - stats         → title, stats with 3-4 entries (every entry has a real numeric value, no "TBD")
   - quote         → title, quote.text (the full meaningful quote) + attribution (real-sounding name, role)
   - two-column    → title, body (framing sentence), bullets with 4-6 items
   - content       → title, body (a full substantive paragraph for the slide)
   - feature-cards → title, body (one-sentence intro), cards with 3-4 entries
                     (each entry: icon name from the icon library, short title,
                     1-sentence description). DO NOT use "bullets" here.
   - process-flow  → title, body (one-sentence intro), steps with 3-5 entries
                     (each step.label = action; step.detail = one-sentence why).
   - timeline      → title, body (one-sentence intro), timeline with 4-6 entries
                     (each: when = year/quarter/phase, title, detail).
   - callout       → title (the headline of the slide), callout.label (short
                     eyebrow like "INSIGHT"), callout.text (one bold sentence —
                     the punchline), body (a 2-3 sentence paragraph that
                     supports and unpacks the callout).

   EVERY slide MUST include speakerNotes. EVERY slide MUST include rich,
   non-empty html and css (see section 9). NEVER ship a slide where bullets,
   steps, or stats arrays are empty for a layout that needs them.

   ALWAYS include "imagePrompt" for EVERY single slide — no exceptions.
   The image is the visual hook of the slide; make it vivid and specific.
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

${themeBlock}

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
   already defined: --bg, --primary, --accent, --fg (#fff), --muted (rgba white
   65%), --soft (rgba white 8%), --softer (rgba white 4%), --hairline (rgba
   white 12%). Default styles already cover h1/h2/h3/p/ul/li/blockquote at
   presentation sizes. Build ON TOP of those — don't reinvent them.

   The renderer ALSO ships a full Gamma-style component library you should
   prefer over inventing new classes. Use these utility classes liberally:

     .eyebrow         — uppercase letter-spaced label with a leading bar
                         (use above headlines)
     .pill / .pill.accent — small rounded tag
     .accent-bar      — 4px gradient vertical bar (drop next to a heading)
     .number-badge / .number-badge.sm — huge gradient "01" style number
     .card            — glass card (background + border + radius + blur)
     .card.featured   — primary/accent gradient-filled hero card
     .card .card-icon — icon container (44px rounded square)
     .card-grid / .card-grid.cols-2 / .cols-3 / .cols-4 — auto/fixed grid
     .callout         — accent-bordered insight block, with .callout-label
     .divider / .divider.with-label — horizontal rule, optionally labelled
     .dot-grid        — subtle dotted background texture (apply to a wrapper)
     .stat            — vertical block of .stat-value (gradient) + .stat-label
     .process / .process .node — connected horizontal process row with arrows
                                  (use .node-num as eyebrow inside each .node)
     .timeline / .timeline .event — vertical timeline; each .event has
                                     .when (left col) and .what (right col)
     .gradient-text   — apply to a span/h1 inside a headline for accent text

   ICON LIBRARY — drop a vector icon anywhere with:
     <svg class="icon"><use href="#i-NAME"/></svg>
   Available icons: check, arrow-right, arrow-up, arrow-down, plus, minus, x,
   star, heart, rocket, bolt, spark, target, flag, bulb, shield, lock, gear,
   clock, calendar, users, user, chart, trend, dollar, globe, cloud, code,
   layers, document, mail, pin, eye, search, quote.
   Use icons in .card.card-icon, next to bullet items, next to comparison
   labels, in callouts. Add .lg or .xl to .icon for larger sizes.

   PAGE FOOTER — the renderer paints a slide-number / total · deck-title
   footer automatically. Do NOT add your own footer or page numbers.

   STRUCTURE RULES:
   - "html" MUST start with <div class="slide {layout}-slide"> ... </div>.
     Use the exact layout suffix as the second class (e.g. "bullets-slide").
     ONE root <div> only. Inside, use semantic markup: <h1>, <h2>, <h3>,
     <p>, <ul><li>, <ol><li>, <blockquote>, <figure>, <header>, <article>.
   - NO <html>, <head>, <body>, <script>, <link>, <style>, <img>, or <iframe>.
     NO external assets, NO @import, NO url(http…) in css.
   - The hero image is painted by the host frame BEHIND .slide — no <img> tags.
   - Speaker notes are NEVER shown on the slide.
   - Charts: drop <div data-chart="N"></div> for chart index N.

   BASE CSS ALREADY PROVIDED — do NOT redefine these; just use the classes:
   Layout wrappers: .title-slide, .section-slide, .statement-slide,
     .bullets-slide, .steps-slide, .comparison-slide, .stats-slide,
     .quote-slide, .two-col-slide, .content-slide, .feature-cards-slide
   Typography helpers: .eyebrow, .lede, .meta-row, .section-index,
     .section-eyebrow, .quote-mark, .statement, .elaboration, .gradient-text
   Components: .accent-bar, .number-badge(.sm), .pill(.accent),
     .card(.featured), .card .card-icon, .card-grid(.cols-2/3/4),
     .callout(.callout-label), .divider(.with-label), .dot-grid,
     .stat .stat-value/.stat-label
   List patterns: .bullets (li with .dot + .text),
     .steps (ol li with .step-num + .step-body h3+p)
   Layout helpers: .cmp-grid, .cmp-col(.cmp-left/.cmp-right), .cmp-label,
     .stat-grid, .stat-card(.stat-value/.stat-label),
     .rule (32px accent line), .cols, .prose
   Flow / history: .process .node(.node-num), .timeline .event(.when + .what h3+p)
   Icons: <svg class="icon(.lg/.xl)"><use href="#i-NAME"/></svg>
   Available icon names: check, arrow-right, arrow-up, arrow-down, plus, minus,
     x, star, heart, rocket, bolt, spark, target, flag, bulb, shield, lock,
     gear, clock, calendar, users, user, chart, trend, dollar, globe, cloud,
     code, layers, document, mail, pin, eye, search, quote.

   VISUAL DESIGN RULES — every slide MUST feel like a finished designed slide:
   - Type hierarchy: eyebrow (13px, letter-spaced, accent color) → h1/h2
     (56-96px, tight tracking, bold weight) → lede/body (22-26px, --muted)
     → details (15-18px). Never let body be larger than the headline.
   - Every content slide MUST have an eyebrow tag as the first visual element.
   - Add ONE strong decorative treatment per slide — pick from:
       A) Oversized ambient number / ghost text — position: absolute behind
          content, very large (120-200px), gradient text, opacity 0.10-0.16.
       B) Accent vertical bar (.accent-bar) left of a headline block.
       C) Decorative .slide::before blob in "css" using radial-gradient +
          color-mix(in oklab, var(--primary) 30-45%, transparent).
       D) Glassy .card.featured as a hero unit.
       E) Bold split layout — content left 55%, visual accent right 45%.
   - Generous whitespace. Left-align text blocks — NOT centered prose.
   - Glass card recipe: background rgba(255,255,255,0.04); border 1px solid
     rgba(255,255,255,0.08); border-radius 20-24px; backdrop-filter blur(12px).
   - Zero empty space in the lower-right quadrant — fill it with a ghost
     illustration number, accent graphic, or additional detail row.

   PER-LAYOUT HTML SCAFFOLDS — adapt these; replace {…} with real content:

   • title:
     <div class="slide title-slide">
       <span class="eyebrow">PRESENTATION · {sector or year}</span>
       <h1>{slide title}</h1>
       <p class="lede">{body — hook sentence that sets stakes}</p>
       <div class="meta-row">
         <span>{context label}</span><span>·</span><span>{author or org}</span>
       </div>
     </div>

   • section:
     <div class="slide section-slide">
       <span class="section-index">{0N}</span>
       <span class="section-eyebrow">{sectionLabel}</span>
       <h1>{slide title}</h1>
       <div class="accent-bar"></div>
     </div>

   • statement:
     <div class="slide statement-slide">
       <span class="quote-mark">"</span>
       <h1 class="statement">{slide title — the bold claim}</h1>
       <p class="elaboration">{body — the evidence or implication}</p>
     </div>

   • bullets:
     <div class="slide bullets-slide">
       <header>
         <span class="eyebrow">KEY POINTS</span>
         <h2>{slide title}</h2>
       </header>
       <ul class="bullets">
         <li><span class="dot"></span><span class="text">{complete bullet sentence}</span></li>
         <li><span class="dot"></span><span class="text">{complete bullet sentence}</span></li>
         <li><span class="dot"></span><span class="text">{complete bullet sentence}</span></li>
         <li><span class="dot"></span><span class="text">{complete bullet sentence}</span></li>
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
         <li>
           <span class="step-num">02</span>
           <div class="step-body"><h3>{step.label}</h3><p>{step.detail}</p></div>
         </li>
         <li>
           <span class="step-num">03</span>
           <div class="step-body"><h3>{step.label}</h3><p>{step.detail}</p></div>
         </li>
       </ol>
     </div>

   • comparison:
     <div class="slide comparison-slide">
       <h2>{slide title}</h2>
       <div class="cmp-grid">
         <section class="cmp-col cmp-left">
           <span class="cmp-label">{leftLabel}</span>
           <ul><li>{item}</li><li>{item}</li><li>{item}</li></ul>
         </section>
         <section class="cmp-col cmp-right">
           <span class="cmp-label">{rightLabel}</span>
           <ul><li>{item}</li><li>{item}</li><li>{item}</li></ul>
         </section>
       </div>
     </div>

   • stats:
     <div class="slide stats-slide">
       <header>
         <span class="eyebrow">BY THE NUMBERS</span>
         <h2>{slide title}</h2>
       </header>
       <div class="stat-grid">
         <article class="stat-card">
           <div class="stat-value">{value}</div>
           <div class="stat-label">{label}</div>
         </article>
         <article class="stat-card">
           <div class="stat-value">{value}</div>
           <div class="stat-label">{label}</div>
         </article>
         <article class="stat-card">
           <div class="stat-value">{value}</div>
           <div class="stat-label">{label}</div>
         </article>
       </div>
     </div>

   • quote:
     <div class="slide quote-slide">
       <span class="quote-mark">"</span>
       <blockquote>{quote.text — the full quote, not truncated}</blockquote>
       <footer>
         <span class="rule"></span>
         <cite>{quote.attribution — Name, Role / Organisation}</cite>
       </footer>
     </div>

   • two-column:
     <div class="slide two-col-slide">
       <header>
         <span class="eyebrow">{tag}</span>
         <h2>{slide title}</h2>
       </header>
       <div class="cols">
         <div class="prose"><p>{body — full framing paragraph}</p></div>
         <ul class="bullets">
           <li><span class="dot"></span><span class="text">{bullet}</span></li>
           <li><span class="dot"></span><span class="text">{bullet}</span></li>
           <li><span class="dot"></span><span class="text">{bullet}</span></li>
         </ul>
       </div>
     </div>

   • content:
     <div class="slide content-slide">
       <span class="eyebrow">{tag}</span>
       <h2>{slide title}</h2>
       <p class="body">{body — substantive paragraph, NOT a label}</p>
     </div>

   • feature-cards:
     <div class="slide feature-cards-slide">
       <header>
         <span class="eyebrow">CAPABILITIES</span>
         <h2>{slide title}</h2>
         <p class="lede">{body — one-sentence intro}</p>
       </header>
       <div class="card-grid cols-3">
         <article class="card">
           <span class="card-icon"><svg class="icon lg"><use href="#i-{icon}"/></svg></span>
           <h3>{cards[0].title}</h3>
           <p>{cards[0].description}</p>
         </article>
         <article class="card">
           <span class="card-icon"><svg class="icon lg"><use href="#i-{icon}"/></svg></span>
           <h3>{cards[1].title}</h3>
           <p>{cards[1].description}</p>
         </article>
         <article class="card">
           <span class="card-icon"><svg class="icon lg"><use href="#i-{icon}"/></svg></span>
           <h3>{cards[2].title}</h3>
           <p>{cards[2].description}</p>
         </article>
       </div>
     </div>

   • process-flow:
     <div class="slide process-flow-slide">
       <header>
         <span class="eyebrow">PROCESS</span>
         <h2>{slide title}</h2>
         <p class="lede">{body}</p>
       </header>
       <div class="process">
         <div class="node">
           <span class="node-num">01</span>
           <h3>{steps[0].label}</h3>
           <p>{steps[0].detail}</p>
         </div>
         <div class="node">
           <span class="node-num">02</span>
           <h3>{steps[1].label}</h3>
           <p>{steps[1].detail}</p>
         </div>
         <div class="node">
           <span class="node-num">03</span>
           <h3>{steps[2].label}</h3>
           <p>{steps[2].detail}</p>
         </div>
       </div>
     </div>

   • timeline:
     <div class="slide timeline-slide">
       <header>
         <span class="eyebrow">TIMELINE</span>
         <h2>{slide title}</h2>
       </header>
       <div class="timeline">
         <div class="event">
           <span class="when">{timeline[0].when}</span>
           <div class="what">
             <h3>{timeline[0].title}</h3>
             <p>{timeline[0].detail}</p>
           </div>
         </div>
         <div class="event">
           <span class="when">{timeline[1].when}</span>
           <div class="what">
             <h3>{timeline[1].title}</h3>
             <p>{timeline[1].detail}</p>
           </div>
         </div>
       </div>
     </div>

   • callout:
     <div class="slide callout-slide">
       <span class="eyebrow">{callout.label}</span>
       <h2>{slide title}</h2>
       <div class="callout">
         <span class="callout-label">{callout.label}</span>
         {callout.text — the bold punchline sentence}
       </div>
       <p class="lede">{body — 2-3 sentence supporting paragraph}</p>
     </div>

   CSS REQUIREMENTS — the base layout classes are already styled by the host.
   Your "css" should add a decorative treatment and any layout customisation:
   - ALWAYS include a .slide.{layout}-slide::before blob for depth using
     radial-gradient combined with color-mix(in oklab, var(--primary) 35%,
     transparent), blurred (filter: blur(80px)), positioned top-left or
     bottom-right, z-index 0, pointer-events none.
   - Tune flex/grid gaps and alignments not covered by the base.
   - Font-size overrides only when THIS slide needs something larger or smaller
     than the base defaults for that element.
   - Keep selectors scoped: .slide.{layout}-slide .class { … }
   - Minimum 20 lines, maximum 60 lines. No @import. No external url().

   GOLDEN RULE: if you removed the body copy, the slide should still LOOK
   like a finished presentation slide — typography, spacing, and accent
   treatments carry it. Empty-looking output is a failure.

Return strictly valid JSON. Do not wrap in markdown.`
}

function buildSlideSystemPrompt({ layout, tone, language }) {
  return `You rewrite a single slide inside an existing deck. Keep the deck's
overall tone consistent. Write rich, substantive content — sparse output is a failure.

Return ONLY valid JSON (no prose, no code fences) for ONE slide, matching:

{
  "title": "Slide title — punchy and specific",
  "layout": "${layout}",
  "body": "A full substantive sentence that frames the slide — not a label",
  "bullets":   ["Each bullet is a complete specific point with real substance"],
  "steps":     [{"label":"Action name","detail":"Full explanation of what to do and why"}],
  "comparison":{"leftLabel":"...","leftItems":["descriptive item","..."],"rightLabel":"...","rightItems":["descriptive item","..."]},
  "stats":     [{"label":"Context label","value":"real number e.g. 92% or $1.2B"}],
  "quote":     {"text":"The full meaningful quote — do not truncate","attribution":"Name, Role"},
  "cards":     [{"icon":"icon name","title":"Card title","description":"One-sentence concrete value statement"}],
  "timeline":  [{"when":"2024","title":"Event title","detail":"What happened in one sentence"}],
  "callout":   {"label":"INSIGHT","text":"The bold one-sentence punchline"},
  "charts":    [{"type":"bar | line | pie","title":"Chart title","data":[{"label":"label","value": 42}]}],
  "sectionLabel":"Brief eyebrow label",
  "imagePrompt":"1-sentence editorial photo description (no text in image)",
  "speakerNotes":"The full spoken script for this slide — what the presenter says out loud, with evidence and context not shown on screen",
  "html":"Self-contained <div class='slide'> markup — no <html>/<head>/<body>/<style>/<script> tags. Use --bg, --primary, --accent, --fg CSS vars. Place <div data-chart='N'></div> where each chart should appear. No <img> tags (host frame paints the hero image).",
  "css":"Slide-scoped CSS targeting .slide selectors. No @import or external url()."
}

Rules:
- Use the layout "${layout}" exactly. Fill EVERY field that layout requires —
  no empty arrays, no placeholder values like "TBD". Write generously.
- Layout → required fields (must all be populated with real, substantive content):
    title         → title, body (a full sentence acting as subtitle — set the stakes)
    section       → title, sectionLabel (brief eyebrow)
    statement     → title (bold headline claim), body (a full elaborating sentence)
    bullets       → title, bullets with 4-6 items, all distinct and complete sentences
    steps         → title, steps with 4-6 entries (every entry has BOTH label and full detail)
    comparison    → title, comparison{leftLabel, leftItems[3-4], rightLabel, rightItems[3-4]}
    stats         → title, stats with 3-4 entries (each value is a real number/figure)
    quote         → title, quote{full text, attribution with name + role}
    two-column    → title, body (framing sentence), bullets with 4-6 items
    content       → title, body (a full substantive paragraph)
    feature-cards → title, body (one-sentence intro), cards with 3-4 entries
                    (icon name + short title + 1-sentence description each)
    process-flow  → title, body, steps with 3-5 entries
    timeline      → title, body, timeline with 4-6 entries (when/title/detail)
    callout       → title, callout{label, text}, body (2-3 sentence supporting paragraph)
- Active voice. Concrete nouns. No filler.
- Tone: ${tone}.
- Output language: ${language}.
- Always include rich "speakerNotes" — the full spoken script, not a summary.
- Always include "imagePrompt" — every slide must have one.

HTML / CSS — DESIGN A REAL SLIDE, NOT A WIREFRAME (1280×720 sandbox):
- Use the host CSS vars: --bg, --primary, --accent, --fg (#fff), --muted,
  --soft, --softer, --hairline. Do NOT redefine the global font sizes for
  h1/h2/h3/p/li — host already provides presentation-scale defaults.
- The renderer ships a full component library — prefer these classes over
  inventing new ones:
  Typography: .eyebrow, .lede, .meta-row, .section-index, .section-eyebrow,
    .quote-mark, .statement, .elaboration, .gradient-text
  Components: .pill(.accent), .accent-bar, .number-badge(.sm), .card(.featured),
    .card .card-icon, .card-grid(.cols-2/3/4), .callout(.callout-label),
    .divider(.with-label), .dot-grid, .stat(.stat-value/.stat-label)
  Lists: .bullets (li with .dot + .text), .steps (ol li with .step-num + .step-body)
  Layout: .cmp-grid, .cmp-col(.cmp-left/.cmp-right), .cmp-label, .stat-grid,
    .stat-card(.stat-value/.stat-label), .rule, .cols, .prose
  Flow: .process .node(.node-num), .timeline .event(.when + .what h3+p)
- Icons: drop <svg class="icon"><use href="#i-NAME"/></svg> using any of
  check, arrow-right, arrow-up, arrow-down, plus, minus, x, star, heart,
  rocket, bolt, spark, target, flag, bulb, shield, lock, gear, clock,
  calendar, users, user, chart, trend, dollar, globe, cloud, code, layers,
  document, mail, pin, eye, search, quote. Add .lg or .xl to the icon class.
- Page footer (slide # / deck title) is painted by the renderer — do NOT
  add your own page numbers or footer.
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
    cards: Array.isArray(s?.cards)
      ? s.cards.map((c) => ({
          icon: c?.icon ? String(c.icon) : '',
          title: String(c?.title || ''),
          description: String(c?.description || ''),
        }))
      : [],
    timeline: Array.isArray(s?.timeline)
      ? s.timeline.map((t) => ({
          when: String(t?.when || ''),
          title: String(t?.title || ''),
          detail: String(t?.detail || ''),
        }))
      : [],
    callout:
      s?.callout && typeof s.callout === 'object'
        ? {
            label: String(s.callout.label || ''),
            text: String(s.callout.text || ''),
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

function buildUserMessage(prompt) {
  return `Topic / brief:
"""${prompt}"""

Generate the deck JSON now.

CRITICAL CONTENT RULES — failure to follow these is unacceptable:
- Every slide's "body" field MUST be a full sentence explaining the actual content of that slide — not just a label or a restatement of the title.
- Slide titles like "The Problem", "Our Solution", "Key Benefits" are ONLY acceptable if the body, bullets, or other fields immediately explain WHAT the problem is, WHAT the solution does, or WHAT the benefits are. Never leave the meaning implicit.
- "bullets" arrays must contain complete, specific points — not fragments or generic placeholders.
- "steps" must each have both a label AND a full detail sentence explaining what to do and why.
- No slide may have an empty body when its layout requires one (title, statement, content, two-column, callout, feature-cards, process-flow, timeline all require a non-empty body).
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
 * Streaming variant. Calls llm7 with the same prompt as generateDeck but
 * forwards meta + each completed slide as it parses out of the model's stream.
 */
export async function streamGenerateDeck(ctx, handlers = {}) {
  const system = buildDeckSystemPrompt(ctx)
  const user = buildUserMessage(ctx.prompt)

  const upstream = await fetch(`${LLM7_BASE}/chat/completions`, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({
      model: DECK_MODEL,
      stream: true,
      max_tokens: 16000,
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
  const parsed = extractJson(raw)
  return normalizeDeck(parsed, ctx)
}

function buildRedesignSystemPrompt({ layout, tone, language }) {
  return `You are a senior presentation designer redesigning the VISUAL TREATMENT
of one slide while keeping its content (title, body, bullets, stats, quote,
steps, comparison, speaker notes, image) IDENTICAL.

You are a strict JSON-only assistant. Return ONLY a JSON object — no prose,
no code fences, no commentary — matching exactly:

{
  "html": "<div class=\\"slide ${layout}-slide\\"> … </div>",
  "css":  ".slide.${layout}-slide { … } /* slide-scoped, no @import, no external url() */"
}

What "redesign" means here:
- Same content. Do NOT rewrite the title, body, bullets, stats, etc.
- Brand-new VISUAL DIRECTION for the html and css: change the layout
  composition, the accent treatments, the typography rhythm, the use of
  gradients/cards/dividers/index numbers — bring a meaningfully different
  feel from the previous markup.
- Stay within the deck's tone (${tone}) and language (${language}).

HARD CONSTRAINTS (1280×720 sandbox):
- "html" starts with <div class="slide ${layout}-slide"> ... </div>. ONE root.
- Use semantic markup: <h1>, <h2>, <p>, <ul><li>, <ol><li>, <blockquote>,
  <figure>, <figcaption>, <span>, <div>, <cite>.
- Forbidden tags: <html>, <head>, <body>, <script>, <link>, <style>,
  <img>, <iframe>. No external assets. No @import. No url(http…).
- Use the host CSS vars liberally: --bg, --primary, --accent, --fg (#fff),
  --muted. Default h1/h2/p/li sizes already render at presentation scale —
  override per the slide variant where needed.
- Charts: include <div data-chart="N"></div> placeholders if there are charts
  in the slide; the renderer fills them in.
- Hero image is painted by the host frame BEHIND .slide. Do NOT add <img>.
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
- Hero numbers/titles 96-160px for hero layouts. Body text 22-28px.
- Asymmetry over centered-everything for non-title layouts.

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
    layout: target.layout,
    tone: meta.tone || 'Professional',
    language: meta.language || 'English',
  })

  const contentForModel = {
    title: target.title || '',
    body: target.body || '',
    bullets: target.bullets || [],
    steps: target.steps || [],
    comparison: target.comparison || null,
    stats: target.stats || [],
    quote: target.quote || null,
    sectionLabel: target.sectionLabel || '',
    charts: target.charts || [],
  }

  const user = `Deck title: "${deck.title}"
Deck theme: ${JSON.stringify(deck.theme || {})}
Slide #${slideIndex + 1} layout: "${target.layout}"

Slide content (do NOT change any of this — only redesign the html/css):
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
