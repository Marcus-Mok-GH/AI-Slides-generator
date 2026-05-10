/**
 * Server-side PDF builder using jsPDF.
 *
 * Converts a deck into a text-based 16:9 PDF (1280×720 pt per slide).
 * Uses the same layout dispatch approach as exportPptx.js so all 14
 * layouts render correctly.
 *
 * Coordinate system: top-left (0,0), y increases downward.
 * Scale vs PPTX: 1 inch = 96 pdf-pt here (1280 / 13.333").
 */

import { jsPDF } from 'jspdf'

// ─── Canvas constants ────────────────────────────────────────────────────────
const W  = 1280
const H  = 720
const ML = 64          // left  margin (≈ 0.67 in × 96)
const MR = 64          // right margin
const CW = W - ML - MR // 1152 — usable content width

// ─── Colour helpers ──────────────────────────────────────────────────────────
function hex(raw, fallback = '#FFFFFF') {
  const s = String(raw || '').replace(/^#/, '')
  return '#' + (s.length >= 6 ? s : fallback.replace(/^#/, '')).toUpperCase()
}

// ─── Core text helper ────────────────────────────────────────────────────────
/**
 * Add text to the slide. y is the visual TOP of the text block.
 * jsPDF baseline is 'alphabetic' so we add fontSize to convert.
 *
 * @param {jsPDF}  pdf
 * @param {string} text
 * @param {number} x        left edge (pt)
 * @param {number} y        top edge of text block (pt)
 * @param {object} opts
 */
function txt(pdf, text, x, y, opts = {}) {
  const {
    fontSize = 18,
    color    = '#FFFFFF',
    bold     = false,
    italic   = false,
    align    = 'left',
    maxWidth = null,
    lineGap  = 1.3,    // line height multiplier
  } = opts

  if (!text) return

  const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal'
  pdf.setFontSize(fontSize)
  pdf.setFont('helvetica', style)
  pdf.setTextColor(color)

  // jsPDF baseline offset: text() y is the alphabetic baseline ≈ top + 0.8×fontSize
  const baseline = y + fontSize * 0.8

  const jOpts = { align }

  if (maxWidth) {
    const lines = pdf.splitTextToSize(String(text), maxWidth)
    lines.forEach((line, i) => {
      pdf.text(line, x, baseline + i * fontSize * lineGap, jOpts)
    })
  } else {
    pdf.text(String(text), x, baseline, jOpts)
  }
}

// ─── Shape helpers ───────────────────────────────────────────────────────────
function filledRect(pdf, x, y, w, h, fillColor) {
  pdf.setFillColor(fillColor)
  pdf.rect(x, y, w, h, 'F')
}

function filledEllipse(pdf, cx, cy, rx, ry, fillColor) {
  pdf.setFillColor(fillColor)
  pdf.ellipse(cx, cy, rx, ry, 'F')
}

function hLine(pdf, x1, y1, x2, color) {
  pdf.setDrawColor(color)
  pdf.setLineWidth(1)
  pdf.line(x1, y1, x2, y1)
}

function vLine(pdf, x, y1, y2, color) {
  pdf.setDrawColor(color)
  pdf.setLineWidth(1)
  pdf.line(x, y1, x, y2)
}

// ─── Background gradient blobs (approximated as soft ellipses) ──────────────
function addBg(pdf, colors) {
  // Primary blob — top-left
  pdf.setFillColor(colors.primary)
  pdf.setGState(new pdf.GState({ opacity: 0.08 }))
  pdf.ellipse(ML, H * 0.1, 320, 280, 'F')

  // Accent blob — bottom-right
  pdf.setFillColor(colors.accent)
  pdf.ellipse(W - ML, H * 0.88, 290, 260, 'F')

  pdf.setGState(new pdf.GState({ opacity: 1 }))
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function addFooter(pdf, slideIndex, total, deckTitle, colors) {
  const y = H - 20
  if (deckTitle) {
    txt(pdf, deckTitle, ML, y, {
      fontSize: 10, color: colors.muted, align: 'left',
    })
  }
  txt(pdf, `${slideIndex + 1} / ${total}`, W - MR, y, {
    fontSize: 10, color: colors.muted, bold: true, align: 'right',
  })
}

// ─── Layout builders ─────────────────────────────────────────────────────────

function buildTitle(pdf, slide, colors) {
  const { title, body } = slide
  if (title) {
    txt(pdf, title, W / 2, H * 0.28, {
      fontSize: 60, bold: true, color: colors.fg,
      align: 'center', maxWidth: CW,
    })
  }
  if (body) {
    txt(pdf, body, W / 2, H * 0.62, {
      fontSize: 22, color: colors.muted,
      align: 'center', maxWidth: CW * 0.8,
    })
  }
}

function buildSection(pdf, slide, colors) {
  const { title, sectionLabel } = slide
  if (sectionLabel) {
    txt(pdf, sectionLabel.toUpperCase(), W / 2, H * 0.32, {
      fontSize: 13, color: colors.accent, bold: true,
      align: 'center', maxWidth: CW,
    })
  }
  if (title) {
    txt(pdf, title, W / 2, H * 0.42, {
      fontSize: 56, bold: true, color: colors.fg,
      align: 'center', maxWidth: CW,
    })
  }
}

function buildStatement(pdf, slide, colors) {
  const { title, body } = slide
  const titleY = body ? H * 0.22 : H * 0.28
  if (title) {
    txt(pdf, title, W / 2, titleY, {
      fontSize: 52, bold: true, color: colors.fg,
      align: 'center', maxWidth: CW,
    })
  }
  if (body) {
    txt(pdf, body, W / 2, titleY + 220, {
      fontSize: 20, color: colors.muted,
      align: 'center', maxWidth: CW * 0.8,
    })
  }
}

function buildBullets(pdf, slide, colors) {
  const { title, body, bullets } = slide
  let y = 56
  if (title) {
    txt(pdf, title, ML, y, { fontSize: 38, bold: true, color: colors.fg, maxWidth: CW })
    y += 100
  } else {
    y += 20
  }
  if (body) {
    txt(pdf, body, ML, y, { fontSize: 18, color: colors.muted, maxWidth: CW })
    y += 45
  }
  if (bullets?.length) {
    bullets.slice(0, 6).forEach((b) => {
      txt(pdf, '•', ML, y, { fontSize: 15, color: colors.accent, bold: true })
      txt(pdf, String(b), ML + 22, y, { fontSize: 16, color: colors.fg, maxWidth: CW - 22 })
      y += 46
    })
  }
}

function buildSteps(pdf, slide, colors) {
  const { title, body, steps } = slide
  let y = 56
  if (title) {
    txt(pdf, title, ML, y, { fontSize: 34, bold: true, color: colors.fg, maxWidth: CW })
    y += 90
  }
  if (body) {
    txt(pdf, body, ML, y, { fontSize: 17, color: colors.muted, maxWidth: CW })
    y += 42
  }
  if (steps?.length) {
    const maxSteps = Math.min(steps.length, 5)
    const rowH = Math.min(90, (H - y - 48) / maxSteps)
    steps.slice(0, maxSteps).forEach((s, i) => {
      // Badge circle
      filledEllipse(pdf, ML + 16, y + 16, 16, 16, colors.primary)
      txt(pdf, `${i + 1}`, ML + 8, y + 4, { fontSize: 14, bold: true, color: '#FFFFFF' })
      // Label
      txt(pdf, s.label || '', ML + 40, y, { fontSize: 15, bold: true, color: colors.fg, maxWidth: CW - 40 })
      if (s.detail) {
        txt(pdf, s.detail, ML + 40, y + 24, { fontSize: 12, color: colors.muted, maxWidth: CW - 40 })
      }
      y += rowH
    })
  }
}

function buildComparison(pdf, slide, colors) {
  const { title, comparison } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 30, bold: true, color: colors.fg, maxWidth: CW })
  }
  const colW = (CW - 30) / 2
  const labelY = 160
  const itemsBaseY = 210

  // Left column
  if (comparison?.leftLabel) {
    txt(pdf, comparison.leftLabel.toUpperCase(), ML, labelY, {
      fontSize: 12, bold: true, color: colors.accent,
    })
  }
  ;(comparison?.leftItems || []).slice(0, 5).forEach((item, i) => {
    txt(pdf, `• ${item}`, ML, itemsBaseY + i * 48, {
      fontSize: 14, color: colors.fg, maxWidth: colW,
    })
  })

  // Divider
  vLine(pdf, ML + colW + 14, 140, H - 48, colors.primary)

  // Right column
  const rx = ML + colW + 30
  if (comparison?.rightLabel) {
    txt(pdf, comparison.rightLabel.toUpperCase(), rx, labelY, {
      fontSize: 12, bold: true, color: colors.primary,
    })
  }
  ;(comparison?.rightItems || []).slice(0, 5).forEach((item, i) => {
    txt(pdf, `• ${item}`, rx, itemsBaseY + i * 48, {
      fontSize: 14, color: colors.fg, maxWidth: colW,
    })
  })
}

function buildStats(pdf, slide, colors) {
  const { title, body, stats } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 32, bold: true, color: colors.fg, maxWidth: CW })
  }
  if (body) {
    txt(pdf, body, ML, 140, { fontSize: 17, color: colors.muted, maxWidth: CW })
  }
  const items = (stats || []).slice(0, 4)
  if (!items.length) return
  const statW = CW / items.length
  const statY = body ? 220 : 190
  items.forEach((s, i) => {
    const x = ML + i * statW + statW / 2
    txt(pdf, String(s.value || ''), x, statY, {
      fontSize: 64, bold: true, color: colors.accent, align: 'center',
    })
    txt(pdf, String(s.label || ''), x, statY + 88, {
      fontSize: 14, color: colors.muted, align: 'center', maxWidth: statW,
    })
  })
}

function buildQuote(pdf, slide, colors) {
  const { quote } = slide
  const quoteText = quote?.text || slide.body || ''
  const attribution = quote?.attribution || ''
  const qY = attribution ? H * 0.20 : H * 0.26

  // Opening quote mark
  txt(pdf, '\u201C', ML, qY - 50, { fontSize: 90, bold: true, color: colors.accent })

  if (quoteText) {
    txt(pdf, quoteText, ML + 8, qY, {
      fontSize: 28, italic: true, color: colors.fg, maxWidth: CW - 8,
    })
  }
  if (attribution) {
    txt(pdf, `— ${attribution}`, W - MR, H - 80, {
      fontSize: 15, color: colors.muted, align: 'right',
    })
  }
}

function buildCallout(pdf, slide, colors) {
  const { title, body, callout } = slide
  const label   = callout?.label || ''
  const calloutText = callout?.text || title || ''
  const supporting  = body || ''

  if (label) {
    txt(pdf, label.toUpperCase(), W / 2, H * 0.22, {
      fontSize: 13, bold: true, color: colors.accent, align: 'center',
    })
  }
  if (calloutText) {
    txt(pdf, calloutText, W / 2, H * 0.33, {
      fontSize: 44, bold: true, color: colors.fg, align: 'center', maxWidth: CW,
    })
  }
  if (supporting) {
    txt(pdf, supporting, W / 2, H * 0.70, {
      fontSize: 18, color: colors.muted, align: 'center', maxWidth: CW * 0.82,
    })
  }
}

function buildFeatureCards(pdf, slide, colors) {
  const { title, body, cards } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 30, bold: true, color: colors.fg, maxWidth: CW })
  }
  if (body) {
    txt(pdf, body, ML, 130, { fontSize: 16, color: colors.muted, maxWidth: CW })
  }
  const items = (cards || []).slice(0, 4)
  if (!items.length) return
  const cardW = (CW - 16 * (items.length - 1)) / items.length
  const cardY = body ? 195 : 150
  const cardH = H - cardY - 55

  items.forEach((card, i) => {
    const x = ML + i * (cardW + 16)
    // Card panel
    pdf.setFillColor(colors.primary)
    pdf.setGState(new pdf.GState({ opacity: 0.15 }))
    pdf.roundedRect(x, cardY, cardW, cardH, 10, 10, 'F')
    pdf.setGState(new pdf.GState({ opacity: 1 }))
    // Card border
    pdf.setDrawColor(colors.primary)
    pdf.setLineWidth(1)
    pdf.roundedRect(x, cardY, cardW, cardH, 10, 10, 'S')

    txt(pdf, card.title || '', x + 14, cardY + 20, {
      fontSize: 15, bold: true, color: colors.fg, maxWidth: cardW - 28,
    })
    if (card.description) {
      txt(pdf, card.description, x + 14, cardY + 58, {
        fontSize: 11, color: colors.muted, maxWidth: cardW - 28,
      })
    }
  })
}

function buildTimeline(pdf, slide, colors) {
  const { title, timeline } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 30, bold: true, color: colors.fg, maxWidth: CW })
  }
  const items = (timeline || []).slice(0, 5)
  if (!items.length) return
  const startY = 155
  const itemH  = Math.min(95, (H - startY - 50) / items.length)
  const labelW = 130

  items.forEach((ev, i) => {
    const y = startY + i * itemH
    txt(pdf, String(ev.when || ''), ML, y + 4, {
      fontSize: 13, bold: true, color: colors.accent, maxWidth: labelW,
    })
    // Dot
    filledEllipse(pdf, ML + labelW + 18, y + 14, 8, 8, colors.primary)
    // Vertical connector
    if (i < items.length - 1) {
      vLine(pdf, ML + labelW + 18, y + 22, y + itemH, colors.primary)
    }
    // Event text
    const ex = ML + labelW + 36
    txt(pdf, ev.title || '', ex, y + 2, {
      fontSize: 14, bold: true, color: colors.fg, maxWidth: CW - labelW - 36,
    })
    if (ev.detail) {
      txt(pdf, ev.detail, ex, y + 26, {
        fontSize: 11, color: colors.muted, maxWidth: CW - labelW - 36,
      })
    }
  })
}

function buildProcessFlow(pdf, slide, colors) {
  const { title, body, steps } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 30, bold: true, color: colors.fg, maxWidth: CW })
  }
  if (body) {
    txt(pdf, body, ML, 130, { fontSize: 16, color: colors.muted, maxWidth: CW })
  }
  const items = (steps || []).slice(0, 5)
  if (!items.length) return
  const startY = body ? 200 : 160
  const nodeW  = Math.min(210, CW / items.length - 16)
  const nodeH  = H - startY - 55
  const spacing = (CW - nodeW * items.length) / Math.max(items.length - 1, 1)

  items.forEach((s, i) => {
    const x = ML + i * (nodeW + spacing)
    // Box
    pdf.setFillColor(colors.primary)
    pdf.setGState(new pdf.GState({ opacity: 0.15 }))
    pdf.roundedRect(x, startY, nodeW, nodeH, 10, 10, 'F')
    pdf.setGState(new pdf.GState({ opacity: 1 }))
    pdf.setDrawColor(colors.primary)
    pdf.setLineWidth(1)
    pdf.roundedRect(x, startY, nodeW, nodeH, 10, 10, 'S')

    txt(pdf, `${i + 1}`, x + nodeW / 2, startY + 14, {
      fontSize: 14, bold: true, color: colors.accent, align: 'center',
    })
    txt(pdf, s.label || '', x + nodeW / 2, startY + 50, {
      fontSize: 12, bold: true, color: colors.fg, align: 'center', maxWidth: nodeW - 20,
    })
    if (s.detail) {
      txt(pdf, s.detail, x + nodeW / 2, startY + 88, {
        fontSize: 10, color: colors.muted, align: 'center', maxWidth: nodeW - 20,
      })
    }
    // Arrow
    if (i < items.length - 1) {
      txt(pdf, '→', x + nodeW + 2, startY + nodeH / 2 - 16, {
        fontSize: 20, color: colors.primary, align: 'left',
      })
    }
  })
}

function buildTwoColumn(pdf, slide, colors) {
  const { title, body, bullets, cards } = slide
  if (title) {
    txt(pdf, title, ML, 50, { fontSize: 30, bold: true, color: colors.fg, maxWidth: CW })
  }
  const colY = 150
  const colH = H - colY - 55
  const colW = (CW - 30) / 2

  if (body) {
    txt(pdf, body, ML, colY, { fontSize: 16, color: colors.fg, maxWidth: colW })
  }
  vLine(pdf, ML + colW + 14, colY, colY + colH, colors.primary)

  const rightItems = bullets || (cards || []).map((c) => `${c.title}: ${c.description}`)
  const rx = ML + colW + 30
  ;(rightItems || []).slice(0, 6).forEach((item, i) => {
    txt(pdf, '•', rx, colY + i * 46, { fontSize: 13, color: colors.accent, bold: true })
    txt(pdf, String(item), rx + 20, colY + i * 46, {
      fontSize: 14, color: colors.fg, maxWidth: colW - 20,
    })
  })
}

function buildContent(pdf, slide, colors) {
  buildBullets(pdf, slide, colors)
}

// ─── Layout dispatch ──────────────────────────────────────────────────────────
const LAYOUT_BUILDERS = {
  title:           buildTitle,
  section:         buildSection,
  statement:       buildStatement,
  bullets:         buildBullets,
  steps:           buildSteps,
  comparison:      buildComparison,
  stats:           buildStats,
  quote:           buildQuote,
  callout:         buildCallout,
  'feature-cards': buildFeatureCards,
  timeline:        buildTimeline,
  'process-flow':  buildProcessFlow,
  'two-column':    buildTwoColumn,
  content:         buildContent,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a PDF Buffer from a deck object.
 *
 * @param {object} deck  The full deck (title, theme, slides[]).
 * @returns {Promise<Buffer>} Raw PDF bytes.
 */
export async function buildPdfBuffer(deck) {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [W, H],
    compress: true,
  })

  const theme = deck.theme || {}
  const colors = {
    bg:      hex(theme.background, '#0F0F1A'),
    fg:      '#FFFFFF',
    muted:   '#A0B0C0',
    primary: hex(theme.primary,   '#7C5CFF'),
    accent:  hex(theme.accent,    '#FF6EA0'),
  }

  const slides = deck.slides || []
  const total  = slides.length

  for (let i = 0; i < total; i++) {
    if (i > 0) pdf.addPage([W, H], 'landscape')

    const slide = slides[i]

    // 1. Background
    filledRect(pdf, 0, 0, W, H, colors.bg)

    // 2. Soft background blobs (decorative, low opacity)
    try { addBg(pdf, colors) } catch { /* ignore if GState not available */ }

    // 3. Content
    const layout  = slide.layout || 'bullets'
    const builder = LAYOUT_BUILDERS[layout] || buildBullets
    try {
      builder(pdf, slide, colors)
    } catch (err) {
      console.warn(`[pdf] slide ${i + 1} layout "${layout}" error:`, err?.message)
      if (slide.title) {
        txt(pdf, slide.title, W / 2, H * 0.3, {
          fontSize: 36, bold: true, color: colors.fg, align: 'center', maxWidth: CW,
        })
      }
    }

    // 4. Footer
    addFooter(pdf, i, total, deck.title, colors)
  }

  return Buffer.from(pdf.output('arraybuffer'))
}
