/**
 * Deck → PDF / PPTX exporters that run in the browser.
 *
 * The server renders with headless Chrome when it has one. When it does not
 * (a serverless host without a browser binary), the viewer calls these instead
 * so the download still matches the stage exactly.
 *
 * Each slide is mounted in an off-screen iframe using the very same document
 * `HtmlSlide` renders, then snapshotted by wrapping that document in an SVG
 * `<foreignObject>` and drawing it to a canvas. That path is the browser's own
 * layout engine, so `color-mix()`, gradients, inline SVG and the icon sprite
 * all come through — html2canvas could not parse the deck CSS at all.
 */

import { buildSlideDocument } from './slideDocument.js'

const SLIDE_W = 1280
const SLIDE_H = 720
const PIXEL_RATIO = 2

function mountFrame(html) {
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;width:' +
    SLIDE_W +
    'px;height:' +
    SLIDE_H +
    'px;pointer-events:none;'
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText =
    'width:' + SLIDE_W + 'px;height:' + SLIDE_H + 'px;border:0;display:block;'
  host.appendChild(frame)
  document.body.appendChild(host)
  frame.srcdoc = html
  return { host, frame }
}

function waitForLoad(frame) {
  return new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true })
    // srcdoc occasionally resolves before the load event is observed.
    setTimeout(resolve, 1500)
  })
}

/** Wait for images and fonts so the snapshot can't catch a half-painted slide. */
async function settle(frame) {
  const doc = frame.contentDocument
  if (!doc) throw new Error('Slide frame has no document')
  await Promise.all(
    Array.from(doc.images, (img) =>
      img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
    ),
  )
  await doc.fonts?.ready?.catch?.(() => {})
  await new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function snapshot(doc) {
  const xhtml = new XMLSerializer().serializeToString(doc.documentElement)
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    SLIDE_W +
    '" height="' +
    SLIDE_H +
    '"><foreignObject width="100%" height="100%">' +
    xhtml +
    '</foreignObject></svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** Render one slide to a PNG data URL at 2x for crisp print and projection. */
export async function renderSlideToPng(slide, theme, footerOpts = {}) {
  const html = buildSlideDocument(slide, theme, footerOpts)
  const { host, frame } = mountFrame(html)
  try {
    await waitForLoad(frame)
    await settle(frame)

    const img = new Image()
    img.src = snapshot(frame.contentDocument)
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = SLIDE_W * PIXEL_RATIO
    canvas.height = SLIDE_H * PIXEL_RATIO
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable in this browser')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    host.remove()
  }
}

export async function exportDeckToPdf(deck, { onProgress } = {}) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  })

  const slides = deck.slides || []
  for (let i = 0; i < slides.length; i++) {
    onProgress?.({ index: i, total: slides.length, phase: 'render' })
    const png = await renderSlideToPng(slides[i], deck.theme, {
      index: i,
      total: slides.length,
      deckTitle: deck.title,
    })
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape')
    pdf.addImage(png, 'PNG', 0, 0, SLIDE_W, SLIDE_H)
  }

  pdf.save(`${safeName(deck.title)}.pdf`)
}

export async function exportDeckToPptx(deck, { onProgress } = {}) {
  const PptxGen = (await import('pptxgenjs')).default
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 inches (16:9)
  pptx.author = 'AI Slides Generator'
  pptx.title = deck.title || 'Deck'
  pptx.subject = deck.subtitle || ''

  const slides = deck.slides || []
  for (let i = 0; i < slides.length; i++) {
    onProgress?.({ index: i, total: slides.length, phase: 'render' })
    const png = await renderSlideToPng(slides[i], deck.theme, {
      index: i,
      total: slides.length,
      deckTitle: deck.title,
    })
    const slide = pptx.addSlide()
    slide.background = { color: hexBare(deck.theme?.background || '#0f0f1a') }
    slide.addImage({ data: png, x: 0, y: 0, w: 13.333, h: 7.5 })
    if (slides[i]?.speakerNotes) {
      slide.addNotes(slides[i].speakerNotes)
    }
  }

  await pptx.writeFile({ fileName: `${safeName(deck.title)}.pptx` })
}

function hexBare(hex) {
  // pptxgenjs wants color strings without the leading "#"
  return String(hex || '').replace(/^#/, '') || '0f0f1a'
}

function safeName(title) {
  return (
    String(title || 'deck')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'deck'
  )
}
