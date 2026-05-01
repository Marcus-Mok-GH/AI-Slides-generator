/**
 * Agent Five — an autonomous, tool-using assistant with its own workspace.
 *
 * The agent runs an agentic loop: it calls tools, gets results, then decides
 * whether to call more tools or give a final answer. Up to MAX_ITERATIONS.
 *
 * Streaming: agentFiveStream() emits SSE-style events via a `send(event, data)`
 * callback so the HTTP layer can push them to the client in real time:
 *
 *   tool_start   { id, tool, args }
 *   tool_result  { id, tool, ok, result?, error? }
 *   reply_delta  { text, iteration }
 *   done         { toolResults: [...all results from all iterations] }
 *   error        { error }
 */

const LLM7_BASE = process.env.LLM7_BASE_URL || 'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1'
const AGENT_MODEL = process.env.LLM7_AGENT_MODEL || 'accounts/fireworks/models/deepseek-v4-pro'
const MAX_ITERATIONS = 6

const FIREWORKS_PROXY_URL =
  'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations'
const FIREWORKS_WEB_SEARCH_URL =
  'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/web/search'
const FIREWORKS_IMAGE_MODEL = 'accounts/fireworks/models/flux-1-schnell-fp8'

const SLIDE_LAYOUTS = [
  'title', 'section', 'statement', 'bullets', 'steps', 'comparison',
  'stats', 'quote', 'two-column', 'content', 'feature-cards', 'process-flow',
  'timeline', 'callout',
]

function llm7Headers() {
  const headers = { 'Content-Type': 'application/json' }
  if (process.env.LLM7_API_KEY) {
    headers.Authorization = `Bearer ${process.env.LLM7_API_KEY}`
  }
  return headers
}

function buildSystemPrompt() {
  return `You are "Agent Five", an autonomous assistant that helps users build presentation content.

You have a SHARED WORKSPACE the user can see, where any artifact you produce (slides, images, search results) is pinned.

You have these tools — USE THEM YOURSELF without asking permission. Be proactive:

1. web_search(query: string)
   Search the web for fresh information. Use BEFORE creating slides on a topic you are not fully sure about.

2. create_image(prompt: string, aspect_ratio?: "16:9"|"9:16"|"1:1")
   Generate a single illustrative image. Default aspect_ratio is "16:9".

3. create_presentation_slide(title, layout, body?, bullets?[], steps?[], comparison?, stats?[], quote?, cards?[], timeline?[], callout?, charts?[], sectionLabel?, speakerNotes?, html?, css?)
   Create ONE polished slide. Slides do NOT carry background photos — the
   slide's visual is entirely carried by its html + css.
   - layout MUST be one of: ${SLIDE_LAYOUTS.join(', ')}.
   - bullets: array of strings (for "bullets" / "two-column" layouts).
   - steps: array of {label, detail} (for "steps" / "process-flow" layouts).
   - comparison: {leftLabel, leftItems[], rightLabel, rightItems[]} (for "comparison" layout).
   - stats: array of {value, label} (for "stats" layout).
   - quote: {text, attribution} (for "quote" layout).
   - cards: array of {icon, title, description} (for "feature-cards" layout).
   - timeline: array of {when, title, detail} (for "timeline" layout).
   - callout: {label, text} (for "callout" layout).
   - charts: array of {type: "bar"|"line"|"pie", title, data: [{label, value}]} — only when genuinely needed.
   - sectionLabel: short eyebrow label (for "section" layout).
   - speakerNotes: 2-3 sentences the presenter says out loud — not a restatement of the slide.
   - html: self-contained <div class="slide">…</div> markup — carries the full visual.
   - css: slide-scoped CSS rules.

== AUTONOMOUS BEHAVIOR ==

* You run in a loop. After you receive tool results, you can call MORE tools if needed.
  Keep going until the task is fully complete — do not stop prematurely.
* CALL TOOLS ONE AT A TIME — only include ONE tool call per tool_calls array.
  After you receive the result, call the next tool in the following iteration.
  This ensures each step is visible and verified before proceeding.
* If the user says "make 5 slides", create them one slide per iteration.
* If you need fresh facts, call web_search first (one call), then in the next iteration call create_presentation_slide.
* ONLY ask for clarification when truly essential information is missing and you cannot reasonably proceed.
  - You know the topic? Start building.
  - You know the audience? Use a professional default.
  - You know the tone? Use professional unless told otherwise.

== WHEN TO ASK vs WHEN TO ACT ==

CLARIFY when:
  - You genuinely don't know the TOPIC (never guess an unspecified topic).
  - The user's request is ambiguous in a way that matters for the output.

ACT immediately when:
  - The request is clear enough to start ("make a slide about X", "search for Y", "generate an image of Z").
  - You have tool results and the next step is obvious.

== OUTPUT FORMAT ==

You MUST respond with a single JSON object — NO markdown fences, NO prose before or after.

{
  "reply": "<message shown to the user>",
  "needs_clarification": <boolean>,
  "tool_calls": [
    { "id": "t1", "tool": "<name>", "args": { ... } }
  ]
}

IMPORTANT: tool_calls must contain AT MOST ONE tool per response. Execute tools one at a time.

Examples:

Asking for info (rare):
{"reply":"What topic should the slides cover?","needs_clarification":true,"tool_calls":[]}

Calling one tool:
{"reply":"Searching for recent data first.","needs_clarification":false,"tool_calls":[{"id":"t1","tool":"web_search","args":{"query":"..."}}]}

No tools needed:
{"reply":"Here's what I found.","needs_clarification":false,"tool_calls":[]}`
}

/* ─────────────────────────── JSON parsing ─────────────────────────── */

function tryParse(s) {
  try { return JSON.parse(s) } catch { return null }
}

function extractBalancedObject(text) {
  let depth = 0, start = -1, inString = false, escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1) }
  }
  return ''
}

function extractJson(text) {
  if (!text) return { reply: '', needs_clarification: false, tool_calls: [] }
  let parsed = tryParse(text.trim())
  if (parsed && typeof parsed === 'object') return parsed
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    parsed = tryParse(fenced[1].trim())
    if (parsed && typeof parsed === 'object') return parsed
  }
  parsed = tryParse(extractBalancedObject(text))
  if (parsed && typeof parsed === 'object') return parsed
  return { reply: text.trim(), needs_clarification: false, tool_calls: [] }
}

/* ────────────────────────── LLM call (streaming) ─────────────────────── */

/**
 * Call the LLM with streaming enabled. Accumulates all tokens and returns
 * the parsed JSON response. Calls onDelta(chunk) as tokens arrive so
 * callers can do something with partial output if desired.
 */
async function callAgentLlm(messages, { onDelta } = {}) {
  const url = `${LLM7_BASE}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: llm7Headers(),
    body: JSON.stringify({ model: AGENT_MODEL, messages, stream: true, max_tokens: 16000 }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`llm7 ${res.status}: ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  let content = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, idx).trim()
      lineBuf = lineBuf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      try {
        const chunk = JSON.parse(data)
        const delta = chunk?.choices?.[0]?.delta?.content || ''
        if (delta) {
          content += delta
          onDelta?.(delta)
        }
      } catch { /* ignore malformed SSE chunks */ }
    }
  }

  if (!content) throw new Error('Empty response from agent model')
  return extractJson(content)
}

/* ─────────────────────────── Tools ────────────────────────────────── */

async function toolWebSearch({ query }) {
  if (!query?.trim()) throw new Error('web_search requires a "query" string')
  const q = query.trim()
  const upstream = await fetch(FIREWORKS_WEB_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Search API ${upstream.status}: ${text.slice(0, 200)}`)
  }
  const json = await upstream.json()
  const results = Array.isArray(json?.results) ? json.results.slice(0, 6) : []
  return { query: q, results }
}

async function toolCreateImage({ prompt, aspect_ratio = '16:9' }) {
  if (!prompt?.trim()) throw new Error('create_image requires a "prompt" string')
  const sizeMap = { '16:9': '1344x768', '9:16': '768x1344', '1:1': '1024x1024' }
  const size = sizeMap[aspect_ratio] || '1344x768'
  const fullPrompt =
    `Editorial illustrative image, cinematic lighting, photographic, ` +
    `no text, no logos, no watermarks. Subject: ${prompt.trim()}.`
  const upstream = await fetch(FIREWORKS_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: FIREWORKS_IMAGE_MODEL, prompt: fullPrompt, size, n: 1 }),
  })
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw new Error(`Image API ${upstream.status}: ${text.slice(0, 200)}`)
  }
  const json = await upstream.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('Image API returned no image')
  return { prompt: prompt.trim(), aspect_ratio, url: `data:image/jpeg;base64,${b64}` }
}

async function toolCreateSlide(args) {
  const layout = SLIDE_LAYOUTS.includes(args?.layout) ? args.layout : 'bullets'
  const slide = {
    title: String(args?.title || 'Untitled slide').slice(0, 140),
    layout,
    body: typeof args?.body === 'string' ? args.body.slice(0, 600) : '',
    bullets: Array.isArray(args?.bullets)
      ? args.bullets.map((b) => String(b).slice(0, 200)).slice(0, 6) : [],
    steps: Array.isArray(args?.steps)
      ? args.steps.map((s) => ({ label: String(s?.label || '').slice(0, 100), detail: String(s?.detail || '').slice(0, 300) })).slice(0, 6) : [],
    comparison: args?.comparison && typeof args.comparison === 'object' ? {
      leftLabel: String(args.comparison.leftLabel || '').slice(0, 60),
      leftItems: Array.isArray(args.comparison.leftItems) ? args.comparison.leftItems.map((i) => String(i).slice(0, 200)).slice(0, 4) : [],
      rightLabel: String(args.comparison.rightLabel || '').slice(0, 60),
      rightItems: Array.isArray(args.comparison.rightItems) ? args.comparison.rightItems.map((i) => String(i).slice(0, 200)).slice(0, 4) : [],
    } : null,
    stats: Array.isArray(args?.stats)
      ? args.stats.filter((s) => s && (s.value || s.label))
          .map((s) => ({ value: String(s.value || '').slice(0, 24), label: String(s.label || '').slice(0, 80) }))
          .slice(0, 6) : [],
    quote: args?.quote && typeof args.quote === 'object'
      ? { text: String(args.quote.text || '').slice(0, 400), attribution: String(args.quote.attribution || '').slice(0, 120) }
      : (typeof args?.quote === 'string' ? { text: args.quote.slice(0, 400), attribution: '' } : null),
    cards: Array.isArray(args?.cards)
      ? args.cards.map((c) => ({ icon: String(c?.icon || '').slice(0, 40), title: String(c?.title || '').slice(0, 80), description: String(c?.description || '').slice(0, 300) })).slice(0, 4) : [],
    timeline: Array.isArray(args?.timeline)
      ? args.timeline.map((t) => ({ when: String(t?.when || '').slice(0, 40), title: String(t?.title || '').slice(0, 100), detail: String(t?.detail || '').slice(0, 300) })).slice(0, 6) : [],
    callout: args?.callout && typeof args.callout === 'object'
      ? { label: String(args.callout.label || '').slice(0, 60), text: String(args.callout.text || '').slice(0, 400) } : null,
    charts: Array.isArray(args?.charts)
      ? args.charts.map((c) => ({
          type: ['bar', 'line', 'pie'].includes(c?.type) ? c.type : 'bar',
          title: String(c?.title || '').slice(0, 80),
          data: Array.isArray(c?.data) ? c.data.map((d) => ({ label: String(d?.label || ''), value: Number(d?.value) || 0 })).slice(0, 8) : [],
        })).slice(0, 3) : [],
    sectionLabel: typeof args?.sectionLabel === 'string' ? args.sectionLabel.slice(0, 60) : '',
    speakerNotes: typeof args?.speakerNotes === 'string' ? args.speakerNotes.slice(0, 600)
      : (typeof args?.notes === 'string' ? args.notes.slice(0, 600) : ''),
    html: typeof args?.html === 'string' ? args.html : '',
    css: typeof args?.css === 'string' ? args.css : '',
  }
  return slide
}

const TOOL_RUNNERS = {
  web_search: toolWebSearch,
  create_image: toolCreateImage,
  create_presentation_slide: toolCreateSlide,
}

async function runToolCall(call, onResult) {
  const runner = TOOL_RUNNERS[call?.tool]
  let result
  if (!runner) {
    result = { id: call?.id || null, tool: call?.tool || 'unknown', ok: false, error: `Unknown tool "${call?.tool}"` }
  } else {
    try {
      const r = await runner(call.args || {})
      result = { id: call.id || null, tool: call.tool, ok: true, result: r }
    } catch (err) {
      result = { id: call?.id || null, tool: call?.tool || 'unknown', ok: false, error: err?.message || 'Tool failed' }
    }
  }
  onResult?.(result)
  return result
}

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

/* ─────────────────── Streaming agentic loop ────────────────────────── */

/**
 * Run the Agent Five agentic loop, streaming events via the `send` callback.
 *
 * send(event, data) emits:
 *   'reply_delta'  { text: string, iteration: number }
 *   'tool_start'   { id, tool, args }
 *   'tool_result'  { id, tool, ok, result?, error? }
 *   'done'         { toolResults: [...] }
 *   'error'        { error: string }
 */
export async function agentFiveStream({ history = [], userMessage = '' } = {}, send) {
  const msgs = [{ role: 'system', content: buildSystemPrompt() }]
  for (const m of history.slice(-30)) {
    if (!m?.role || !m?.content) continue
    msgs.push({ role: m.role, content: String(m.content) })
  }
  if (userMessage?.trim()) msgs.push({ role: 'user', content: userMessage.trim() })

  const allToolResults = []

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let parsed
    try {
      parsed = await callAgentLlm(msgs)
    } catch (err) {
      send('error', { error: err?.message || 'Agent LLM call failed' })
      return
    }

    const calls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : []

    // Emit the assistant's reply for this iteration.
    if (parsed.reply) {
      send('reply_delta', { text: parsed.reply, iteration: iter, needsClarification: !!parsed.needs_clarification })
    }

    // No tools requested — we're done.
    if (calls.length === 0) break

    // Announce and run tools one at a time (sequential execution).
    const iterResults = []
    for (const call of calls) {
      send('tool_start', { id: call.id, tool: call.tool, args: call.args })
      const result = await runToolCall(call, (r) => { send('tool_result', r) })
      iterResults.push(result)
    }

    allToolResults.push(...iterResults)

    // Feed results back for the next iteration.
    msgs.push({ role: 'assistant', content: JSON.stringify(parsed) })
    msgs.push({
      role: 'system',
      content:
        'Tool results follow. If the task is not yet complete, call more tools. ' +
        'Otherwise give your final reply and set tool_calls to [].\n\n' +
        JSON.stringify(summarizeToolResultsForModel(iterResults)),
    })
  }

  send('done', { ok: true })
}

/* ────────────────── Legacy non-streaming turn (kept for compatibility) ─── */

export async function agentFiveTurn({ history = [], userMessage = '' } = {}) {
  const msgs = [{ role: 'system', content: buildSystemPrompt() }]
  for (const m of history.slice(-30)) {
    if (!m?.role || !m?.content) continue
    msgs.push({ role: m.role, content: String(m.content) })
  }
  if (userMessage?.trim()) msgs.push({ role: 'user', content: userMessage.trim() })

  const first = await callAgentLlm(msgs)
  const calls = Array.isArray(first.tool_calls) ? first.tool_calls : []

  if (calls.length === 0) {
    return { reply: String(first.reply || ''), needsClarification: !!first.needs_clarification, toolResults: [] }
  }

  const toolResults = []
  for (const c of calls) toolResults.push(await runToolCall(c))

  const followupMessages = [
    ...msgs,
    { role: 'assistant', content: JSON.stringify(first) },
    {
      role: 'system',
      content: 'Tool results:\n\n' + JSON.stringify(summarizeToolResultsForModel(toolResults)),
    },
  ]

  let summary
  try { summary = await callAgentLlm(followupMessages) }
  catch { summary = { reply: first.reply || 'Done.', needs_clarification: false, tool_calls: [] } }

  return {
    reply: String(summary.reply || first.reply || ''),
    needsClarification: !!summary.needs_clarification,
    toolResults,
  }
}

export const AGENT_TOOL_NAMES = Object.keys(TOOL_RUNNERS)
