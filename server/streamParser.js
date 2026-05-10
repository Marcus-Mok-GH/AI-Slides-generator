/**
 * Incremental JSON deck parser.
 *
 * Feeds streaming text from the model and emits events:
 *   { type: 'meta',    meta: { title, subtitle, theme } }   (once)
 *   { type: 'partial', index, partial: { title?, layout?, body?, bullets?, sectionLabel? } }
 *                                                            (during in-progress slide)
 *   { type: 'slide',   slide: {...}, index: n }              (per completed slide)
 *
 * Strategy: scan character-by-character (string-aware) to find the
 *   "slides": [ ... ]
 * array opener, then track {} depth to know when each top-level slide object
 * closes. Each closed object is JSON.parse'd in isolation. While a slide is
 * still open, we regex-extract any newly-completed string fields and emit
 * partial events so the UI can show the slide title as it's being written.
 *
 * Top-level meta (title/subtitle/theme) is extracted by trying to parse the
 * prefix that comes BEFORE the "slides" key as a self-contained JSON object.
 */

const PARTIAL_STRING_FIELDS = [
  'title',
  'layout',
  'body',
  'sectionLabel',
]

function extractCompletedStringField(snippet, key) {
  // Match: "key" : "value-without-unescaped-quote"
  const re = new RegExp(
    `"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
  )
  const m = re.exec(snippet)
  if (!m) return null
  try {
    return JSON.parse(`"${m[1]}"`)
  } catch {
    return null
  }
}

/**
 * Match an in-flight (still-being-written) string value. The pattern is
 * anchored to the END of the snippet, so it only matches when the buffer
 * currently ends inside the string (no closing quote yet) — perfect for
 * showing text growing word-by-word in the UI.
 */
function extractInProgressStringField(snippet, key) {
  const re = new RegExp(
    `"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`,
  )
  const m = re.exec(snippet)
  if (!m) return null
  // Drop a trailing lone backslash so JSON.parse doesn't choke mid-escape.
  let raw = m[1]
  if (raw.endsWith('\\')) raw = raw.slice(0, -1)
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return null
  }
}

function extractCompletedBulletsArray(snippet) {
  // Find "bullets": [ ... ] where the array is fully closed (no nested arrays).
  const re = /"bullets"\s*:\s*(\[[^\[\]]*\])/
  const m = re.exec(snippet)
  if (!m) return null
  try {
    const arr = JSON.parse(m[1])
    if (Array.isArray(arr)) return arr.map(String)
  } catch {}
  return null
}

/**
 * Match an in-flight bullets array — the opener `[` has appeared but the
 * closing `]` has not. Returns whatever bullets are completed so far PLUS
 * the in-progress trailing bullet if the model is mid-string.
 */
function extractInProgressBulletsArray(snippet) {
  const re = /"bullets"\s*:\s*\[([^\[\]]*)$/
  const m = re.exec(snippet)
  if (!m) return null
  const inner = m[1]
  const items = []

  // Pull all fully-quoted (closed) items.
  const itemRe = /"((?:[^"\\]|\\.)*)"/g
  let mm
  while ((mm = itemRe.exec(inner))) {
    try {
      items.push(JSON.parse(`"${mm[1]}"`))
    } catch {}
  }

  // Walk once to count unescaped quotes and remember the last one. An odd
  // count means the model has just opened an in-flight bullet that has no
  // closing quote yet — that's the one we want to surface as it grows.
  let quoteCount = 0
  let lastUnescapedQuote = -1
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c === '\\') { i++; continue }
    if (c === '"') {
      quoteCount++
      lastUnescapedQuote = i
    }
  }
  if (quoteCount % 2 === 1 && lastUnescapedQuote >= 0) {
    let raw = inner.slice(lastUnescapedQuote + 1)
    if (raw.endsWith('\\')) raw = raw.slice(0, -1)
    try {
      const item = JSON.parse(`"${raw}"`)
      if (item.length > 0) items.push(item)
    } catch {}
  }

  return items.length ? items : null
}

export class DeckStreamParser {
  constructor() {
    this.buf = ''
    this.cursor = 0
    this.state = 'preSlides' // preSlides | inArray | done
    this.elementStart = -1
    this.depth = 0
    this.inString = false
    this.escape = false
    this.metaSent = false
    this.slidesEmitted = 0
    this.partialState = {} // index -> last emitted partial obj
  }

  feed(chunk) {
    this.buf += chunk
    const events = []

    // 1) Try to emit top-level meta (title/subtitle/theme) once we have
    //    enough buffer to see "slides":.
    if (!this.metaSent) {
      const slidesKeyIdx = this.buf.indexOf('"slides"')
      if (slidesKeyIdx > 0) {
        let prefix = this.buf.slice(0, slidesKeyIdx).trim()
        // strip any trailing comma so we can close the object
        while (prefix.endsWith(',')) prefix = prefix.slice(0, -1).trimEnd()
        const candidate = prefix + '}'
        try {
          const obj = JSON.parse(candidate)
          events.push({
            type: 'meta',
            meta: {
              title: obj.title,
              subtitle: obj.subtitle,
              theme: obj.theme,
            },
          })
          this.metaSent = true
        } catch {
          // not enough yet (e.g. theme object still streaming) — try again later
        }
      }
    }

    // 2) Find slides array opener
    if (this.state === 'preSlides') {
      const slice = this.buf.slice(this.cursor)
      const m = slice.match(/"slides"\s*:\s*\[/)
      if (m) {
        this.cursor = this.cursor + m.index + m[0].length
        this.state = 'inArray'
        this.elementStart = -1
        this.depth = 0
      }
    }

    // 3) Scan for slide objects inside the array
    if (this.state === 'inArray') {
      while (this.cursor < this.buf.length) {
        const ch = this.buf[this.cursor]

        if (this.inString) {
          if (this.escape) {
            this.escape = false
          } else if (ch === '\\') {
            this.escape = true
          } else if (ch === '"') {
            this.inString = false
          }
        } else {
          if (ch === '"') {
            this.inString = true
          } else if (ch === '{') {
            if (this.depth === 0) this.elementStart = this.cursor
            this.depth++
          } else if (ch === '}') {
            this.depth--
            if (this.depth === 0 && this.elementStart >= 0) {
              const json = this.buf.slice(this.elementStart, this.cursor + 1)
              try {
                const slide = JSON.parse(json)
                const index = this.slidesEmitted
                this.slidesEmitted++
                // Clear any partial state for this slide — full slide will replace it
                delete this.partialState[index]
                events.push({ type: 'slide', slide, index })
              } catch {
                // shouldn't happen for well-balanced object; ignore
              }
              this.elementStart = -1
            }
          } else if (ch === ']' && this.depth === 0) {
            this.state = 'done'
            this.cursor++
            break
          }
        }
        this.cursor++
      }
    }

    // 4) If we're mid-slide, emit a partial with everything written so far —
    //    completed fields AND any in-flight string the model is currently
    //    typing. The in-progress extractor wins when it matches (the field
    //    is mid-stream); otherwise we fall back to the completed value.
    if (
      this.state === 'inArray' &&
      this.elementStart >= 0 &&
      this.depth >= 1
    ) {
      const slideIdx = this.slidesEmitted
      const snippet = this.buf.slice(this.elementStart, this.cursor)
      const partial = {}
      for (const key of PARTIAL_STRING_FIELDS) {
        const inFlight = extractInProgressStringField(snippet, key)
        if (inFlight !== null) {
          partial[key] = inFlight
          continue
        }
        const done = extractCompletedStringField(snippet, key)
        if (done !== null) partial[key] = done
      }
      const inFlightBullets = extractInProgressBulletsArray(snippet)
      const completedBullets =
        inFlightBullets || extractCompletedBulletsArray(snippet)
      if (completedBullets) partial.bullets = completedBullets

      if (Object.keys(partial).length > 0) {
        const prev = this.partialState[slideIdx] || {}
        const stringChanged = Object.keys(partial).some(
          (k) => k !== 'bullets' && partial[k] !== prev[k],
        )
        const bulletsChanged =
          partial.bullets &&
          JSON.stringify(partial.bullets) !== JSON.stringify(prev.bullets)
        if (stringChanged || bulletsChanged) {
          this.partialState[slideIdx] = { ...prev, ...partial }
          events.push({
            type: 'partial',
            index: slideIdx,
            partial: this.partialState[slideIdx],
          })
        }
      }
    }

    return events
  }
}
