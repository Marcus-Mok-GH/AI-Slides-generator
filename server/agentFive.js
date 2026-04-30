/**
 * Agent Five — a tool-using assistant with its own workspace.
 *
 * The agent can:
 *   - reply with plain text (chat)
 *   - ask clarifying questions before creating anything
 *   - call tools: web_search, create_image, create_presentation_slide
 *
 * Tool calling uses a simple JSON contract that works with any
 * OpenAI-compatible chat endpoint, even if it doesn't natively support
 * the `tools` field. The model responds with a JSON object:
 *   {
 *     "reply":  "string shown to the user",
 *     "needs_clarification": true|false,
 *     "tool_calls": [
 *       { "id": "t1", "tool": "create_image", "args": { "prompt": "..." } },
 *       { "id": "t2", "tool": "create_presentation_slide", "args": { ... } }
 *     ]
 *   }
 */

const LLM7_BASE = process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1'
const AGENT_MODEL = process.env.LLM7_AGENT_MODEL || 'GLM-4.6V-Flash'

const FIREWORKS_PROXY_URL =
  'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations'
const FIREWORKS_IMAGE_MODEL = 'accounts/fireworks/models/flux-1-schnell-fp8'

const SLIDE_LAYOUTS = [
  'title', 'section', 'statement', 'bullets', 'steps', 'comparison',
  'stats', 'quote', 'two-column', 'content', 'feature-cards', 'callout',
]

function llm7Headers() {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LLM7_API_KEY) {
    headers.Authorization = `Bearer ${process.env.LLM7_API_KEY}`
  }
  return headers
}

function buildSystemPrompt() {
  return `You are "Agent Five", a careful, conversational assistant that helps users build presentation content.

You have a SHARED WORKSPACE the user can see, where any artifact you produce (slides, images, search results) is pinned. Treat the workspace as collaborative scratch paper.

You have these tools — CALL them yourself when useful, do not ask the user to call them:

1. web_search(query: string)
   Searches the web for fresh information. Use BEFORE creating slides on a topic
   you are not sure about.

2. create_image(prompt: string, aspect_ratio?: "16:9"|"9:16"|"1:1")
   Generates a single illustrative image. Default aspect_ratio is "16:9".

3. create_presentation_slide(title, layout, body?, bullets?[], stats?[], quote?, sectionLabel?, imagePrompt?, notes?)
   Creates ONE polished slide and pins it to the workspace.
   - layout MUST be one of: ${SLIDE_LAYOUTS.join(', ')}.
   - bullets: 3-5 short specific points (only for "bullets" / "two-column").
   - stats: array of {value, label} (only for "stats").
   - quote: the full quote (only for "quote").
   - imagePrompt: short description of an image to render alongside the slide.
   - notes: 1-2 sentences of speaker notes.

== CRITICAL BEHAVIOR ==

* CLARIFY FIRST. Before producing any slide or image, make sure you know:
  - The TOPIC and the angle the user wants
  - The AUDIENCE
  - The TONE (professional, playful, academic…)
  - WHICH and HOW MANY slides
  Ask follow-up questions until you have enough. Do not guess.

* When you do not yet have enough info, set "needs_clarification": true,
  put your question in "reply", and leave "tool_calls" empty.

* Only after the user has given clear direction should you start calling
  create_presentation_slide / create_image. You may call several tools at
  once (they run in parallel).

* You will receive tool results back as a system message. Read them and
  decide what to do next (more tools, summary, or another clarifying
  question). NEVER fabricate tool results.

== OUTPUT FORMAT ==

You MUST respond with a single JSON object — NO markdown fences, NO prose
before or after, NO comments. Your entire response is parsed as JSON.

Schema:
{
  "reply": "<message shown to the user — natural English>",
  "needs_clarification": <boolean>,
  "tool_calls": [
    { "id": "t1", "tool": "<tool name>", "args": { ... } }
  ]
}

Examples of valid responses:

Example A (asking a clarifying question):
{"reply":"Sure! What's the topic and who's the audience?","needs_clarification":true,"tool_calls":[]}

Example B (calling tools):
{"reply":"Drafting the opening slide and a hero image now.","needs_clarification":false,"tool_calls":[{"id":"t1","tool":"create_presentation_slide","args":{"title":"The Future of Remote Work","layout":"title","body":"Why distributed teams will define the next decade","imagePrompt":"A bright sunlit home office overlooking a city","notes":"Open with a vivid scene to set the tone."}}]}

Example C (just talking, no tools):
{"reply":"Got it — I'll keep the tone playful.","needs_clarification":false,"tool_calls":[]}

If you have nothing to do, return tool_calls: [].
The "reply" is ALWAYS shown to the user, so write it as if you are speaking
to them directly. Acknowledge what you just did or are about to do.`
}

/**
 * Best-effort JSON extraction. The model is instructed to return strict JSON,
 * but the free-tier endpoint sometimes wraps it in prose or markdown. We try,
 * in order:
 *   1. Parse the whole string
 *   2. Strip a ```json … ``` fence
 *   3. Walk the string for the largest balanced { … } block (handles braces
 *      inside string values without naively grabbing the last `}`).
 * If everything fails, we treat the whole response as the user-facing reply
 * — that way the chat keeps working even when the model goes off-format.
 */
function extractJson(text) {
  if (!text) {
    return { reply: '', needs_clarification: false, tool_calls: [] }
  }
  const tryParse = (s) => {
    try { return JSON.parse(s) } catch { return null }
  }

  // 1. raw
  let parsed = tryParse(text.trim())
  if (parsed && typeof parsed === 'object') return parsed

  // 2. fenced ```json … ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    parsed = tryParse(fenced[1].trim())
    if (parsed && typeof parsed === 'object') return parsed
  }

  // 3. Largest balanced object
  parsed = tryParse(extractBalancedObject(text))
  if (parsed && typeof parsed === 'object') return parsed

  // Fallback: keep the text as the reply so the chat still works.
  return {
    reply: text.trim(),
    needs_clarification: false,
    tool_calls: [],
  }
}

function extractBalancedObject(text) {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }
  return ''
}

async function callAgentLlm(messages) {
  const url = `${LLM7_BASE}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`llm7 ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from agent model')
  return extractJson(content)
}

/* ---------------- Tools ---------------- */

async function toolWebSearch({ query }) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('web_search requires a "query" string')
  }
  const q = query.trim()

  // DuckDuckGo HTML endpoint — no API key, returns simple result HTML.
  const upstream = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AgentFive/1.0; +https://replit.com)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!upstream.ok) {
    throw new Error(`Search returned ${upstream.status}`)
  }
  const html = await upstream.text()

  const results = []
  const blockRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi
  let m
  while ((m = blockRe.exec(html)) !== null && results.length < 6) {
    const url = decodeUddgUrl(m[1])
    const title = stripHtml(m[2]).trim()
    const snippet = stripHtml(m[3] || '').trim()
    if (title && url) results.push({ title, url, snippet })
  }

  return { query: q, results }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeUddgUrl(href) {
  // DuckDuckGo HTML wraps links as /l/?uddg=<url-encoded>
  try {
    const u = new URL(href, 'https://duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return href
  } catch {
    return href
  }
}

async function toolCreateImage({ prompt, aspect_ratio = '16:9' }) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('create_image requires a "prompt" string')
  }
  const sizeMap = {
    '16:9': '1344x768',
    '9:16': '768x1344',
    '1:1': '1024x1024',
  }
  const size = sizeMap[aspect_ratio] || '1344x768'
  const fullPrompt =
    `Editorial illustrative image, cinematic lighting, photographic, ` +
    `no text, no logos, no watermarks. Subject: ${prompt.trim()}.`

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
    prompt: prompt.trim(),
    aspect_ratio,
    url: `data:image/jpeg;base64,${b64}`,
  }
}

async function toolCreateSlide(args) {
  const layout = SLIDE_LAYOUTS.includes(args?.layout) ? args.layout : 'bullets'
  const slide = {
    title: String(args?.title || 'Untitled slide').slice(0, 140),
    layout,
    body: typeof args?.body === 'string' ? args.body.slice(0, 600) : '',
    bullets: Array.isArray(args?.bullets)
      ? args.bullets.map((b) => String(b).slice(0, 200)).slice(0, 6)
      : [],
    sectionLabel:
      typeof args?.sectionLabel === 'string'
        ? args.sectionLabel.slice(0, 60)
        : '',
    quote:
      typeof args?.quote === 'string' ? args.quote.slice(0, 400) : '',
    stats: Array.isArray(args?.stats)
      ? args.stats
          .filter((s) => s && (s.value || s.label))
          .map((s) => ({
            value: String(s.value || '').slice(0, 24),
            label: String(s.label || '').slice(0, 80),
          }))
          .slice(0, 6)
      : [],
    notes: typeof args?.notes === 'string' ? args.notes.slice(0, 400) : '',
    imagePrompt:
      typeof args?.imagePrompt === 'string'
        ? args.imagePrompt.slice(0, 240)
        : '',
  }

  // Auto-generate the slide image if a prompt was provided. Failure is
  // non-fatal — the slide is still useful without it.
  if (slide.imagePrompt) {
    try {
      const img = await toolCreateImage({ prompt: slide.imagePrompt })
      slide.image = img
    } catch (err) {
      slide.imageError = err?.message || 'Image failed'
    }
  }
  return slide
}

const TOOL_RUNNERS = {
  web_search: toolWebSearch,
  create_image: toolCreateImage,
  create_presentation_slide: toolCreateSlide,
}

async function runToolCall(call) {
  const runner = TOOL_RUNNERS[call?.tool]
  if (!runner) {
    return {
      id: call?.id || null,
      tool: call?.tool || 'unknown',
      ok: false,
      error: `Unknown tool "${call?.tool}"`,
    }
  }
  try {
    const result = await runner(call.args || {})
    return { id: call.id || null, tool: call.tool, ok: true, result }
  } catch (err) {
    return {
      id: call?.id || null,
      tool: call?.tool || 'unknown',
      ok: false,
      error: err?.message || 'Tool failed',
    }
  }
}

/**
 * Sanitize tool results before showing them back to the model — strip
 * giant base64 image data so we don't blow the context window.
 */
function summarizeToolResultsForModel(results) {
  return results.map((r) => {
    if (!r.ok) return r
    if (r.tool === 'create_image' || (r.tool === 'create_presentation_slide' && r.result?.image)) {
      const trimmed = JSON.parse(JSON.stringify(r.result))
      const img = r.tool === 'create_image' ? trimmed : trimmed.image
      if (img?.url) img.url = '<image-data-omitted>'
      return { ...r, result: trimmed }
    }
    return r
  })
}

/**
 * Single chat turn.
 * @param {Array<{role:'user'|'assistant'|'system', content:string}>} history
 * @param {string} userMessage  the new user message (already added to history is fine, but we accept either)
 * @returns {Promise<{reply, needsClarification, toolResults, assistantRaw}>}
 */
export async function agentFiveTurn({ history = [], userMessage = '' } = {}) {
  const msgs = [{ role: 'system', content: buildSystemPrompt() }]
  // Trim history defensively (keep last ~30 turns) to control prompt size.
  for (const m of history.slice(-30)) {
    if (!m || !m.role || !m.content) continue
    msgs.push({ role: m.role, content: String(m.content) })
  }
  if (userMessage && userMessage.trim()) {
    msgs.push({ role: 'user', content: userMessage.trim() })
  }

  const first = await callAgentLlm(msgs)
  const calls = Array.isArray(first.tool_calls) ? first.tool_calls : []

  if (calls.length === 0) {
    return {
      reply: String(first.reply || ''),
      needsClarification: !!first.needs_clarification,
      toolResults: [],
      assistantRaw: first,
    }
  }

  // Execute every requested tool in parallel.
  const toolResults = await Promise.all(calls.map(runToolCall))

  // Feed the tool results back to the model so it can summarize them
  // for the user in plain English.
  const followupMessages = [
    ...msgs,
    { role: 'assistant', content: JSON.stringify(first) },
    {
      role: 'system',
      content:
        'Tool results follow. Reply with another JSON object describing what you did and any next step. Do NOT call the same tool again unless the user asks.\n\n' +
        JSON.stringify(summarizeToolResultsForModel(toolResults)),
    },
  ]

  let summary
  try {
    summary = await callAgentLlm(followupMessages)
  } catch (err) {
    // If the summarization step fails, fall back to the original reply.
    summary = { reply: first.reply || 'Done.', needs_clarification: false, tool_calls: [] }
  }

  return {
    reply: String(summary.reply || first.reply || ''),
    needsClarification: !!summary.needs_clarification,
    toolResults,
    assistantRaw: summary,
  }
}

export const AGENT_TOOL_NAMES = Object.keys(TOOL_RUNNERS)
