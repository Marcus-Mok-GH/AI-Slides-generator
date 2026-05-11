/**
 * DeckStreamParser — streaming JSON parser for blank-canvas HTML/CSS slides.
 * Extracts only: title, speakerNotes, html, css.
 */

const PARTIAL_STRING_FIELDS = ['title', 'speakerNotes', 'html', 'css']

function extractCompletedStringField(text, key) {
  const re = new RegExp(
    '"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*"',
    'g'
  )
  let last = null
  let m
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length
    let i = start
    let escaped = false
    while (i < text.length) {
      const ch = text[i]
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        last = text.slice(start, i)
        break
      }
      i++
    }
  }
  return last
}

function extractInProgressStringField(text, key) {
  const re = new RegExp(
    '"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*"',
    'g'
  )
  let lastMatch = null
  let m
  while ((m = re.exec(text)) !== null) {
    lastMatch = m
  }
  if (!lastMatch) return null
  const start = lastMatch.index + lastMatch[0].length
  let i = start
  let escaped = false
  while (i < text.length) {
    const ch = text[i]
    if (escaped) {
      escaped = false
    } else if (ch === '\\') {
      escaped = true
    } else if (ch === '"') {
      return text.slice(start, i)
    }
    i++
  }
  return text.slice(start)
}

export class DeckStreamParser {
  constructor() {
    this.buf = ''
    this.state = 'preSlides'
    this.cursor = 0
    this.metaSent = false
    this.slidesEmitted = 0
    this.elementStart = -1
    this.depth = 0
    this.inString = false
    this.escape = false
    this.partialState = {}
  }

  push(chunk) {
    this.buf += chunk
    const events = []

    // 1) Try to extract meta (title/subtitle/theme) once
    if (!this.metaSent) {
      const slidesKeyIdx = this.buf.indexOf('"slides"')
      if (slidesKeyIdx > 0) {
        let prefix = this.buf.slice(0, slidesKeyIdx).trim()
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
        } catch {}
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
                delete this.partialState[index]
                events.push({ type: 'slide', slide, index })
              } catch {}
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

    // 4) Partial extraction for in-flight slides
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

      if (Object.keys(partial).length > 0) {
        const prev = this.partialState[slideIdx] || {}
        const changed = Object.keys(partial).some(
          (k) => partial[k] !== prev[k]
        )
        if (changed) {
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
