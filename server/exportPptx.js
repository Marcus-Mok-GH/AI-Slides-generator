import PptxGenJS from 'pptxgenjs'
import { buildSlideDocument } from '../src/lib/slideDocument.js'

const PX_W = 1280
const PX_H = 720
const W = 13.333
const H = 7.5
const M = 0.67

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
    await page.setViewport({ width: PX_W, height: PX_H, deviceScaleFactor: 1 })
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

function addTextFallbackSlide(pptx, deck, slide, index, total) {
  const pSlide = pptx.addSlide()
  const bg = String(deck?.theme?.background || '0f0f1a').replace(/^#/, '')
  pSlide.background = { color: bg }
  pSlide.addText(slide?.title || `Slide ${index + 1}`, {
    x: M,
    y: 0.8,
    w: W - M * 2,
    h: 1.1,
    fontFace: 'Calibri',
    fontSize: 32,
    bold: true,
    color: 'FFFFFF',
    fit: 'shrink',
  })
  if (slide?.body) {
    pSlide.addText(slide.body, {
      x: M,
      y: 2,
      w: W - M * 2,
      h: 0.8,
      fontFace: 'Calibri',
      fontSize: 17,
      color: 'D8D8E0',
      fit: 'shrink',
    })
  }
  const bullets = Array.isArray(slide?.bullets) ? slide.bullets.slice(0, 8) : []
  if (bullets.length) {
    pSlide.addText(bullets.map((b) => ({ text: b, options: { bullet: { type: 'bullet' } } })), {
      x: M,
      y: slide?.body ? 3.0 : 2.1,
      w: W - M * 2,
      h: 3.7,
      fontFace: 'Calibri',
      fontSize: 15,
      color: 'FFFFFF',
      breakLine: true,
      fit: 'shrink',
    })
  }
  if (slide?.speakerNotes) pSlide.addNotes(slide.speakerNotes)
  pSlide.addText(deck?.title || '', {
    x: M,
    y: H - 0.38,
    w: W * 0.55,
    h: 0.25,
    fontSize: 9,
    color: 'A0A8B8',
  })
  pSlide.addText(`${index + 1} / ${total}`, {
    x: W - M - 1.2,
    y: H - 0.38,
    w: 1.2,
    h: 0.25,
    fontSize: 9,
    bold: true,
    color: 'A0A8B8',
    align: 'right',
  })
}

export async function buildPptxBuffer(deck) {
  const slides = Array.isArray(deck?.slides) ? deck.slides : []
  if (slides.length === 0) throw new Error('Deck has no slides')

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'AI Slides Generator'
  pptx.subject = deck?.subtitle || ''
  pptx.title = deck?.title || 'Deck'
  pptx.company = 'AI Slides Generator'
  pptx.lang = 'en-US'

  let mode = 'raster'
  try {
    const images = await renderSlideImages(deck)
    images.forEach((base64, index) => {
      const pSlide = pptx.addSlide()
      pSlide.background = { color: String(deck?.theme?.background || '0f0f1a').replace(/^#/, '') }
      pSlide.addImage({
        data: `data:image/png;base64,${base64}`,
        x: 0,
        y: 0,
        w: W,
        h: H,
      })
      if (slides[index]?.speakerNotes) pSlide.addNotes(slides[index].speakerNotes)
    })
  } catch (err) {
    mode = 'text'
    console.warn(`[export/pptx] html render failed, using text fallback: ${err.message}`)
    slides.forEach((slide, index) => addTextFallbackSlide(pptx, deck, slide, index, slides.length))
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' })
  // `mode` lets the client say *why* a download looks unlike the deck.
  return { buffer: Buffer.from(arrayBuffer), mode }
}
