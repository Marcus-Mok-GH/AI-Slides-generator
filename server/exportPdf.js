import { jsPDF } from 'jspdf'
import { buildSlideDocument } from '../src/lib/slideDocument.js'

const W = 1280
const H = 720
const M = 64

function addTextFallbackPage(pdf, slide, theme, index, total, deckTitle) {
  const bg = theme?.background || '#0f0f1a'
  pdf.setFillColor(bg)
  pdf.rect(0, 0, W, H, 'F')
  pdf.setTextColor('#FFFFFF')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(42)
  pdf.text(pdf.splitTextToSize(String(slide?.title || `Slide ${index + 1}`), W - M * 2), M, 96)

  let y = 190
  if (slide?.body) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(18)
    pdf.setTextColor('#D8D8E0')
    const lines = pdf.splitTextToSize(String(slide.body), W - M * 2)
    pdf.text(lines, M, y)
    y += lines.length * 26 + 24
  }

  const bullets = Array.isArray(slide?.bullets) ? slide.bullets.slice(0, 8) : []
  pdf.setFontSize(16)
  pdf.setTextColor('#FFFFFF')
  for (const bullet of bullets) {
    const lines = pdf.splitTextToSize(`• ${bullet}`, W - M * 2)
    pdf.text(lines, M, y)
    y += lines.length * 22 + 10
    if (y > H - 80) break
  }

  pdf.setFontSize(10)
  pdf.setTextColor('#A0A0AA')
  if (deckTitle) pdf.text(String(deckTitle), M, H - 24)
  pdf.text(`${index + 1} / ${total}`, W - M, H - 24, { align: 'right' })
}

/**
 * Puppeteer is loaded on demand. Importing it at module scope means a missing
 * or unlaunchable browser binary takes down the whole serverless function on
 * cold start; here a failure is scoped to the export request that needs it.
 */
async function launchBrowser() {
  let puppeteer
  try {
    const mod = await import('puppeteer')
    puppeteer = mod.default || mod
  } catch (err) {
    const e = new Error('Headless browser unavailable on this host (Puppeteer could not be loaded)')
    e.code = 'NO_BROWSER'
    e.cause = err
    throw e
  }
  try {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  } catch (err) {
    const e = new Error('Headless browser unavailable on this host: ' + (err?.message || 'launch failed'))
    e.code = 'NO_BROWSER'
    e.cause = err
    throw e
  }
}

/**
 * The exact document the viewer renders, minus scripts: the on-screen iframe is
 * sandboxed without `allow-scripts`, but a headless browser would happily run
 * anything the model emitted.
 */
function exportDocument(deck, slide, index, total) {
  return buildSlideDocument(slide, deck?.theme || {}, {
    index,
    total,
    deckTitle: deck?.title || '',
  }).replace(/<script[\s\S]*?<\/script>/gi, '')
}

async function renderSlideImages(deck) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
    const slides = Array.isArray(deck?.slides) ? deck.slides : []
    const images = []
    for (let i = 0; i < slides.length; i++) {
      await page.setContent(exportDocument(deck, slides[i], i, slides.length), {
        waitUntil: 'load',
      })
      const buffer = await page.screenshot({ type: 'png' })
      images.push(buffer.toString('base64'))
    }
    return images
  } finally {
    await browser.close()
  }
}

export async function buildPdfBuffer(deck) {
  const slides = Array.isArray(deck?.slides) ? deck.slides : []
  if (slides.length === 0) throw new Error('Deck has no slides')

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [W, H],
    compress: true,
  })

  let mode = 'raster'
  try {
    const images = await renderSlideImages(deck)
    images.forEach((base64, index) => {
      if (index > 0) pdf.addPage([W, H], 'landscape')
      pdf.addImage(`data:image/png;base64,${base64}`, 'PNG', 0, 0, W, H)
    })
  } catch (err) {
    mode = 'text'
    console.warn(`[export/pdf] html render failed, using text fallback: ${err.message}`)
    slides.forEach((slide, index) => {
      if (index > 0) pdf.addPage([W, H], 'landscape')
      addTextFallbackPage(pdf, slide, deck.theme || {}, index, slides.length, deck.title || '')
    })
  }

  // `mode` lets the client say *why* a download looks unlike the deck.
  return { buffer: Buffer.from(pdf.output('arraybuffer')), mode }
}
