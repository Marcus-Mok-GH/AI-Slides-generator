/**
 * Deck → PDF / PPTX exporters.
 *
 * PDF: rasterizes each slide via html2canvas (the slide is mounted in an
 * off-screen sandboxed iframe at native 1280×720), then stitches the bitmaps
 * into a 16:9 PDF page-per-slide via jsPDF.
 *
 * PPTX: ships the same bitmap as a full-bleed image per slide, plus the
 * speaker notes as PPTX notes — opens cleanly in PowerPoint and Google Slides.
 */

import { buildSlideDocument } from '../components/HtmlSlide.jsx'

const SLIDE_W = 1280
const SLIDE_H = 720

/**
 * Render one slide into a 1280x720 PNG data URL by mounting it in an
 * off-screen iframe and snapshotting the body with html2canvas.
 */
async function renderSlideToPng(slide, theme) {
  const html2canvas = (await import('html2canvas')).default

  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;width:' +
    SLIDE_W +
    'px;height:' +
    SLIDE_H +
    'px;pointer-events:none;'
  const iframe = document.createElement('iframe')
  iframe.style.cssText =
    'width:' +
    SLIDE_W +
    'px;height:' +
    SLIDE_H +
    'px;border:0;background:' +
    (theme?.background || '#0f0f1a') +
    ';'
  iframe.setAttribute('sandbox', 'allow-same-origin')
  host.appendChild(iframe)
  document.body.appendChild(host)

  try {
    iframe.srcdoc = buildSlideDocument(slide, theme)
    await new Promise((resolve) => {
      const onLoad = () => resolve()
      iframe.addEventListener('load', onLoad, { once: true })
      // Safety: resolve after 1.5s even if onload doesn't fire (data URL
      // images sometimes don't trigger it consistently across browsers).
      setTimeout(resolve, 1500)
    })
    // Tiny extra beat so any decoded images are painted before the snapshot.
    await new Promise((r) => setTimeout(r, 200))

    const target =
      iframe.contentDocument?.body || iframe.contentDocument?.documentElement
    if (!target) throw new Error('Slide iframe has no document')

    const canvas = await html2canvas(target, {
      width: SLIDE_W,
      height: SLIDE_H,
      windowWidth: SLIDE_W,
      windowHeight: SLIDE_H,
      backgroundColor: theme?.background || '#0f0f1a',
      scale: 2, // crisp on retina + scales nicely up to 4K projection
      useCORS: true,
      logging: false,
    })
    return canvas.toDataURL('image/png')
  } finally {
    document.body.removeChild(host)
  }
}

export async function exportDeckToPdf(deck, { onProgress } = {}) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [SLIDE_W, SLIDE_H],
  })

  const slides = deck.slides || []
  for (let i = 0; i < slides.length; i++) {
    onProgress?.({ index: i, total: slides.length, phase: 'render' })
    const png = await renderSlideToPng(slides[i], deck.theme)
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape')
    pdf.addImage(png, 'PNG', 0, 0, SLIDE_W, SLIDE_H, undefined, 'FAST')
  }

  pdf.save(`${safeName(deck.title)}.pdf`)
}

export async function exportDeckToPptx(deck, { onProgress } = {}) {
  const PptxGen = (await import('pptxgenjs')).default
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 inches (16:9)
  pptx.title = deck.title || 'Deck'
  pptx.subject = deck.subtitle || ''

  const slides = deck.slides || []
  for (let i = 0; i < slides.length; i++) {
    onProgress?.({ index: i, total: slides.length, phase: 'render' })
    const png = await renderSlideToPng(slides[i], deck.theme)
    const slide = pptx.addSlide()
    slide.background = { color: hexBare(deck.theme?.background || '#0f0f1a') }
    slide.addImage({
      data: png,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    })
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
