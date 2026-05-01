/**
 * Server-side PPTX builder.
 *
 * Converts a deck (as stored in our DB) into a fully-editable pptxgenjs
 * presentation. Every slide gets:
 *
 *   - A solid background colour (from deck.theme.background).
 *   - A full-bleed background image when slide.image.url is a data-URL.
 *   - A translucent dark scrim over the image so text stays legible.
 *   - Editable text objects for title, subtitle/body, and all content
 *     specific to the slide layout (bullets, stats, quote, cards, etc.).
 *   - Speaker notes from slide.speakerNotes.
 *   - A footer bar (slide number and deck title) matching the browser view.
 *
 * Layout support:
 *   title | section | statement | bullets | steps | comparison | stats |
 *   quote | two-column | content | feature-cards | process-flow |
 *   timeline | callout
 */

import PptxGenJS from 'pptxgenjs'

// ─── Slide canvas constants ─────────────────────────────────────────────────
const W = 13.333 // slide width  (inches, LAYOUT_WIDE 16:9)
const H = 7.5    // slide height (inches)
const ML = 0.67  // left  margin
const MR = 0.67  // right margin
const CW = W - ML - MR // usable content width

// ─── Colour helpers ──────────────────────────────────────────────────────────
function hex(raw, fallback = 'FFFFFF') {
  return String(raw || fallback).replace(/^#/, '').toUpperCase() || fallback
}
function alpha(pct) { return String(Math.round(pct)).padStart(2, '0') }

// ─── Text option builders ────────────────────────────────────────────────────
function titleOpts(color, size = 36, bold = true) {
  return { bold, fontSize: size, color, fontFace: 'Calibri', fit: 'shrink', valign: 'top' }
}
function bodyOpts(color, size = 18) {
  return { fontSize: size, color, fontFace: 'Calibri', fit: 'shrink', valign: 'top' }
}
function labelOpts(color, size = 11) {
  return { fontSize: size, color, fontFace: 'Calibri', bold: true, charSpacing: 2, valign: 'top' }
}

// ─── Slide components ────────────────────────────────────────────────────────

/**
 * Embed the background image (data-URL) as a full-bleed element.
 * pptxgenjs `data` prop expects `mime/type;base64,...` (no leading "data:").
 */
function addBgImage(pSlide, imgUrl) {
  if (!imgUrl || !imgUrl.startsWith('data:')) return
  pSlide.addImage({
    data: imgUrl.slice('data:'.length),
    x: 0, y: 0, w: W, h: H,
  })
}

/**
 * Semi-transparent scrim to keep text readable over photos.
 * Opacity 0–100 (0 = fully transparent, 100 = fully opaque).
 */
function addScrim(pSlide, bgHex, opacity = 55) {
  pSlide.addShape('rect', {
    x: 0, y: 0, w: W, h: H,
    fill: { type: 'solid', color: bgHex, alpha: opacity },
    line: { type: 'none' },
  })
}

/**
 * Footer bar: slide number on the right, deck title on the left.
 * Mimics the __page-footer rendered in the browser iframe.
 */
function addFooter(pSlide, slideIndex, totalSlides, deckTitle, fgColor) {
  const mutedColor = 'A0A8B8'
  const y = H - 0.38
  if (deckTitle) {
    pSlide.addText(deckTitle, {
      x: ML, y, w: CW * 0.6, h: 0.28,
      fontSize: 9, color: mutedColor, fontFace: 'Calibri',
      align: 'left', valign: 'middle',
    })
  }
  pSlide.addText(`${slideIndex + 1} / ${totalSlides}`, {
    x: ML + CW * 0.6, y, w: CW * 0.4, h: 0.28,
    fontSize: 9, color: mutedColor, fontFace: 'Calibri', bold: true,
    align: 'right', valign: 'middle',
  })
}

// ─── Per-layout content builders ─────────────────────────────────────────────

function buildTitle(pSlide, slide, colors) {
  const { title, body } = slide
  const titleY = H * 0.28
  if (title) {
    pSlide.addText(title, {
      x: ML, y: titleY, w: CW, h: 1.8,
      ...titleOpts(colors.fg, 46),
      align: 'center',
    })
  }
  if (body) {
    pSlide.addText(body, {
      x: ML, y: titleY + 1.9, w: CW, h: 0.85,
      ...bodyOpts(colors.muted, 20),
      align: 'center',
    })
  }
}

function buildSection(pSlide, slide, colors) {
  const { title, sectionLabel } = slide
  if (sectionLabel) {
    pSlide.addText(sectionLabel.toUpperCase(), {
      x: ML, y: H * 0.32, w: CW, h: 0.38,
      ...labelOpts(colors.accent, 12),
      align: 'center',
    })
  }
  if (title) {
    pSlide.addText(title, {
      x: ML, y: H * 0.42, w: CW, h: 1.6,
      ...titleOpts(colors.fg, 44),
      align: 'center',
    })
  }
}

function buildStatement(pSlide, slide, colors) {
  const { title, body } = slide
  const titleY = body ? H * 0.22 : H * 0.28
  if (title) {
    pSlide.addText(title, {
      x: ML, y: titleY, w: CW, h: 2.0,
      ...titleOpts(colors.fg, 42),
      align: 'center',
    })
  }
  if (body) {
    pSlide.addText(body, {
      x: ML * 2, y: titleY + 2.1, w: CW - ML, h: 0.8,
      ...bodyOpts(colors.muted, 19),
      align: 'center',
    })
  }
}

function buildBullets(pSlide, slide, colors) {
  const { title, body, bullets } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.55, w: CW, h: 1.1,
      ...titleOpts(colors.fg, 32),
    })
  }
  let contentY = 1.75
  if (body) {
    pSlide.addText(body, {
      x: ML, y: contentY, w: CW, h: 0.55,
      ...bodyOpts(colors.muted, 17),
    })
    contentY += 0.65
  }
  if (bullets?.length) {
    const rows = bullets.map((b) => [
      { text: '•', options: { color: colors.accent, bold: true, fontSize: 14 } },
      { text: `  ${b}`, options: { color: colors.fg, fontSize: 14 } },
    ])
    pSlide.addTable(rows, {
      x: ML, y: contentY, w: CW, h: H - contentY - 0.55,
      colW: [0.22, CW - 0.22],
      border: { type: 'none' },
      fill: { type: 'none' },
      rowH: 0.42,
      valign: 'top',
    })
  }
}

function buildSteps(pSlide, slide, colors) {
  const { title, body, steps } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.55, w: CW, h: 1.0,
      ...titleOpts(colors.fg, 30),
    })
  }
  let y = body ? 1.75 : 1.6
  if (body) {
    pSlide.addText(body, { x: ML, y: 1.65, w: CW, h: 0.5, ...bodyOpts(colors.muted, 16) })
  }
  if (steps?.length) {
    const maxSteps = Math.min(steps.length, 5)
    const rowH = Math.min(0.9, (H - y - 0.55) / maxSteps)
    for (let i = 0; i < maxSteps; i++) {
      const s = steps[i]
      // Step number badge
      pSlide.addShape('ellipse', {
        x: ML, y: y + 0.06, w: 0.36, h: 0.36,
        fill: { type: 'solid', color: colors.primary },
        line: { type: 'none' },
      })
      pSlide.addText(`${i + 1}`, {
        x: ML, y: y + 0.06, w: 0.36, h: 0.36,
        fontSize: 11, bold: true, color: 'FFFFFF',
        align: 'center', valign: 'middle',
      })
      // Label + detail
      const labelText = s.label || ''
      const detailText = s.detail || ''
      pSlide.addText(
        [
          { text: labelText, options: { bold: true, color: colors.fg, fontSize: 13 } },
          detailText ? { text: `  ${detailText}`, options: { color: colors.muted, fontSize: 12 } } : null,
        ].filter(Boolean),
        { x: ML + 0.48, y, w: CW - 0.48, h: rowH, valign: 'top', fontFace: 'Calibri' },
      )
      y += rowH + 0.06
    }
  }
}

function buildComparison(pSlide, slide, colors) {
  const { title, comparison } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 0.9,
      ...titleOpts(colors.fg, 28),
    })
  }
  const colW = (CW - 0.3) / 2
  const labelY = 1.5
  const itemsY = 1.95
  const itemH = (H - itemsY - 0.55) / Math.max((comparison?.leftItems?.length || 1), 1)

  // Left column
  if (comparison?.leftLabel) {
    pSlide.addText(comparison.leftLabel.toUpperCase(), {
      x: ML, y: labelY, w: colW, h: 0.35,
      ...labelOpts(colors.accent, 11), align: 'left',
    })
  }
  ;(comparison?.leftItems || []).forEach((item, i) => {
    pSlide.addText(`• ${item}`, {
      x: ML, y: itemsY + i * 0.5, w: colW, h: 0.45,
      fontSize: 13, color: colors.fg, fontFace: 'Calibri', valign: 'top',
    })
  })

  // Divider
  pSlide.addShape('line', {
    x: ML + colW + 0.13, y: 1.4, w: 0, h: H - 1.8,
    line: { color: colors.primary, width: 1, transparency: 50 },
  })

  // Right column
  if (comparison?.rightLabel) {
    pSlide.addText(comparison.rightLabel.toUpperCase(), {
      x: ML + colW + 0.3, y: labelY, w: colW, h: 0.35,
      ...labelOpts(colors.primary, 11), align: 'left',
    })
  }
  ;(comparison?.rightItems || []).forEach((item, i) => {
    pSlide.addText(`• ${item}`, {
      x: ML + colW + 0.3, y: itemsY + i * 0.5, w: colW, h: 0.45,
      fontSize: 13, color: colors.fg, fontFace: 'Calibri', valign: 'top',
    })
  })
}

function buildStats(pSlide, slide, colors) {
  const { title, body, stats } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 1.0,
      ...titleOpts(colors.fg, 30),
    })
  }
  if (body) {
    pSlide.addText(body, {
      x: ML, y: 1.55, w: CW, h: 0.5,
      ...bodyOpts(colors.muted, 16),
    })
  }
  const items = (stats || []).slice(0, 4)
  if (!items.length) return
  const statW = CW / items.length
  const statY = body ? 2.25 : 2.0
  items.forEach((s, i) => {
    const x = ML + i * statW
    pSlide.addText(String(s.value || ''), {
      x, y: statY, w: statW, h: 1.35,
      fontSize: 46, bold: true, color: colors.accent,
      fontFace: 'Calibri', align: 'center', valign: 'middle', fit: 'shrink',
    })
    pSlide.addText(String(s.label || ''), {
      x, y: statY + 1.42, w: statW, h: 0.45,
      fontSize: 13, color: colors.muted, fontFace: 'Calibri', align: 'center',
    })
  })
}

function buildQuote(pSlide, slide, colors) {
  const { quote } = slide
  const quoteText = quote?.text || slide.body || ''
  const attribution = quote?.attribution || ''
  const qY = attribution ? H * 0.2 : H * 0.26

  // Opening quotation mark
  pSlide.addText('\u201C', {
    x: ML, y: qY - 0.55, w: 0.9, h: 0.9,
    fontSize: 72, color: colors.accent, fontFace: 'Calibri', bold: true,
  })
  if (quoteText) {
    pSlide.addText(quoteText, {
      x: ML + 0.1, y: qY, w: CW - 0.1, h: 3.0,
      fontSize: 26, italic: true, color: colors.fg,
      fontFace: 'Calibri', align: 'left', valign: 'top', fit: 'shrink',
    })
  }
  if (attribution) {
    pSlide.addText(`— ${attribution}`, {
      x: ML, y: H - 1.7, w: CW, h: 0.45,
      fontSize: 14, color: colors.muted, fontFace: 'Calibri', align: 'right',
    })
  }
}

function buildCallout(pSlide, slide, colors) {
  const { title, body, callout } = slide
  const label = callout?.label || ''
  const text = callout?.text || title || ''
  const supporting = body || ''

  if (label) {
    pSlide.addText(label.toUpperCase(), {
      x: ML, y: H * 0.22, w: CW, h: 0.38,
      ...labelOpts(colors.accent, 12), align: 'center',
    })
  }
  if (text) {
    pSlide.addText(text, {
      x: ML, y: H * 0.31, w: CW, h: 2.0,
      ...titleOpts(colors.fg, 36), align: 'center',
    })
  }
  if (supporting) {
    pSlide.addText(supporting, {
      x: ML * 2, y: H * 0.31 + 2.15, w: CW - ML, h: 0.9,
      ...bodyOpts(colors.muted, 17), align: 'center',
    })
  }
}

function buildFeatureCards(pSlide, slide, colors) {
  const { title, body, cards } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 0.9,
      ...titleOpts(colors.fg, 28),
    })
  }
  if (body) {
    pSlide.addText(body, {
      x: ML, y: 1.45, w: CW, h: 0.45,
      ...bodyOpts(colors.muted, 15),
    })
  }
  const items = (cards || []).slice(0, 4)
  if (!items.length) return
  const cardW = (CW - 0.2 * (items.length - 1)) / items.length
  const cardY = body ? 2.05 : 1.65
  const cardH = H - cardY - 0.6

  items.forEach((card, i) => {
    const x = ML + i * (cardW + 0.2)
    // Card background panel
    pSlide.addShape('roundRect', {
      x, y: cardY, w: cardW, h: cardH,
      rectRadius: 0.12,
      fill: { type: 'solid', color: colors.primary, alpha: 85 },
      line: { color: colors.primary, width: 1, transparency: 60 },
    })
    // Card title
    pSlide.addText(card.title || '', {
      x: x + 0.2, y: cardY + 0.25, w: cardW - 0.4, h: 0.55,
      fontSize: 15, bold: true, color: colors.fg, fontFace: 'Calibri', valign: 'top',
    })
    // Card description
    if (card.description) {
      pSlide.addText(card.description, {
        x: x + 0.2, y: cardY + 0.85, w: cardW - 0.4, h: cardH - 1.1,
        fontSize: 11, color: colors.muted, fontFace: 'Calibri', valign: 'top', fit: 'shrink',
      })
    }
  })
}

function buildTimeline(pSlide, slide, colors) {
  const { title, timeline } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 0.9,
      ...titleOpts(colors.fg, 28),
    })
  }
  const items = (timeline || []).slice(0, 5)
  if (!items.length) return
  const startY = 1.6
  const itemH = Math.min(0.95, (H - startY - 0.6) / items.length)
  const labelW = 1.3
  items.forEach((ev, i) => {
    const y = startY + i * itemH
    // Year/phase label
    pSlide.addText(String(ev.when || ''), {
      x: ML, y, w: labelW, h: itemH - 0.08,
      fontSize: 13, bold: true, color: colors.accent, fontFace: 'Calibri', valign: 'middle',
    })
    // Connector dot
    pSlide.addShape('ellipse', {
      x: ML + labelW + 0.08, y: y + itemH / 2 - 0.09, w: 0.18, h: 0.18,
      fill: { type: 'solid', color: colors.primary },
      line: { type: 'none' },
    })
    // Connector line (skip for last)
    if (i < items.length - 1) {
      pSlide.addShape('line', {
        x: ML + labelW + 0.16, y: y + itemH / 2 + 0.09,
        w: 0, h: itemH - 0.08,
        line: { color: colors.primary, width: 1, transparency: 50 },
      })
    }
    // Event title + detail
    pSlide.addText(
      [
        { text: (ev.title || ''), options: { bold: true, color: colors.fg, fontSize: 13 } },
        ev.detail ? { text: `  ${ev.detail}`, options: { color: colors.muted, fontSize: 11 } } : null,
      ].filter(Boolean),
      {
        x: ML + labelW + 0.36, y, w: CW - labelW - 0.36, h: itemH - 0.08,
        fontFace: 'Calibri', valign: 'middle',
      },
    )
  })
}

function buildProcessFlow(pSlide, slide, colors) {
  const { title, body, steps } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 0.9,
      ...titleOpts(colors.fg, 28),
    })
  }
  if (body) {
    pSlide.addText(body, { x: ML, y: 1.45, w: CW, h: 0.45, ...bodyOpts(colors.muted, 15) })
  }
  const items = (steps || []).slice(0, 5)
  if (!items.length) return
  const startY = body ? 2.1 : 1.7
  const nodeW = Math.min(2.2, CW / items.length - 0.15)
  const nodeH = H - startY - 0.6
  const spacing = (CW - nodeW * items.length) / Math.max(items.length - 1, 1)

  items.forEach((s, i) => {
    const x = ML + i * (nodeW + spacing)
    // Node box
    pSlide.addShape('roundRect', {
      x, y: startY, w: nodeW, h: nodeH,
      rectRadius: 0.15,
      fill: { type: 'solid', color: colors.primary, alpha: 82 },
      line: { color: colors.primary, width: 1, transparency: 50 },
    })
    // Step number
    pSlide.addText(`${i + 1}`, {
      x, y: startY + 0.18, w: nodeW, h: 0.38,
      fontSize: 14, bold: true, color: colors.accent, fontFace: 'Calibri', align: 'center',
    })
    // Label
    pSlide.addText(s.label || '', {
      x: x + 0.1, y: startY + 0.6, w: nodeW - 0.2, h: 0.55,
      fontSize: 12, bold: true, color: colors.fg, fontFace: 'Calibri', align: 'center', valign: 'top',
    })
    // Detail
    if (s.detail) {
      pSlide.addText(s.detail, {
        x: x + 0.1, y: startY + 1.2, w: nodeW - 0.2, h: nodeH - 1.3,
        fontSize: 10, color: colors.muted, fontFace: 'Calibri', align: 'center', valign: 'top', fit: 'shrink',
      })
    }
    // Arrow between nodes
    if (i < items.length - 1) {
      pSlide.addText('→', {
        x: x + nodeW + 0.02, y: startY + nodeH / 2 - 0.22, w: spacing - 0.04, h: 0.45,
        fontSize: 18, color: colors.primary, fontFace: 'Calibri', align: 'center',
      })
    }
  })
}

function buildTwoColumn(pSlide, slide, colors) {
  const { title, body, bullets, cards } = slide
  if (title) {
    pSlide.addText(title, {
      x: ML, y: 0.5, w: CW, h: 0.9,
      ...titleOpts(colors.fg, 28),
    })
  }
  const colY = 1.55
  const colH = H - colY - 0.55
  const colW = (CW - 0.3) / 2

  // Left: body text
  if (body) {
    pSlide.addText(body, {
      x: ML, y: colY, w: colW, h: colH,
      fontSize: 15, color: colors.fg, fontFace: 'Calibri', valign: 'top', fit: 'shrink',
    })
  }
  // Divider
  pSlide.addShape('line', {
    x: ML + colW + 0.13, y: colY, w: 0, h: colH,
    line: { color: colors.primary, width: 1, transparency: 55 },
  })
  // Right: bullets or cards
  const rightItems = bullets || (cards || []).map((c) => `${c.title}: ${c.description}`)
  if (rightItems?.length) {
    const rows = rightItems.map((item) => [
      { text: '•', options: { color: colors.accent, bold: true, fontSize: 13 } },
      { text: `  ${item}`, options: { color: colors.fg, fontSize: 13 } },
    ])
    pSlide.addTable(rows, {
      x: ML + colW + 0.3, y: colY, w: colW, h: colH,
      colW: [0.22, colW - 0.22],
      border: { type: 'none' },
      fill: { type: 'none' },
      rowH: 0.42,
      valign: 'top',
    })
  }
}

function buildContent(pSlide, slide, colors) {
  buildBullets(pSlide, slide, colors) // "content" is essentially a light bullets layout
}

// ─── Layout dispatch ──────────────────────────────────────────────────────────

const LAYOUT_BUILDERS = {
  title:          buildTitle,
  section:        buildSection,
  statement:      buildStatement,
  bullets:        buildBullets,
  steps:          buildSteps,
  comparison:     buildComparison,
  stats:          buildStats,
  quote:          buildQuote,
  callout:        buildCallout,
  'feature-cards': buildFeatureCards,
  timeline:       buildTimeline,
  'process-flow': buildProcessFlow,
  'two-column':   buildTwoColumn,
  content:        buildContent,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a PPTX Buffer from a deck object.
 *
 * @param {object} deck  The full deck as stored in the DB (title, theme, slides[]).
 * @returns {Promise<Buffer>} Raw PPTX bytes suitable for streaming as a response.
 */
export async function buildPptxBuffer(deck) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title   = deck.title || 'Deck'
  pptx.subject = deck.subtitle || ''

  const theme = deck.theme || {}
  const bgHex     = hex(theme.background, '0F0F1A')
  const primaryHex = hex(theme.primary,   '7C5CFF')
  const accentHex  = hex(theme.accent,    'FF6EA0')

  const colors = {
    bg:      bgHex,
    fg:      'FFFFFF',
    muted:   'A0B0C0',
    primary: primaryHex,
    accent:  accentHex,
  }

  const slides = deck.slides || []
  const total  = slides.length

  for (let i = 0; i < total; i++) {
    const slide  = slides[i]
    const pSlide = pptx.addSlide()

    // 1. Solid-colour background (always)
    pSlide.background = { color: bgHex }

    // 2. Background image + scrim
    const hasImage = slide?.image?.url?.startsWith('data:')
    if (hasImage) {
      addBgImage(pSlide, slide.image.url)
      addScrim(pSlide, bgHex, 58)
    }

    // 3. Editable text content (layout-specific)
    const layout  = slide.layout || 'bullets'
    const builder = LAYOUT_BUILDERS[layout] || buildBullets
    try {
      builder(pSlide, slide, colors)
    } catch (err) {
      console.warn(`[pptx] slide ${i + 1} layout "${layout}" build error:`, err?.message)
      // Fallback: just put the title as plain text
      if (slide.title) {
        pSlide.addText(slide.title, {
          x: ML, y: H * 0.3, w: CW, h: 1.5,
          fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Calibri', align: 'center',
        })
      }
    }

    // 4. Footer
    addFooter(pSlide, i, total, deck.title, colors.fg)

    // 5. Speaker notes
    if (slide.speakerNotes) {
      pSlide.addNotes(String(slide.speakerNotes))
    }
  }

  return pptx.write({ outputType: 'nodebuffer' })
}
