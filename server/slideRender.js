import { buildSlideDocument } from '../src/lib/slideDocument.js'

export const SLIDE_W = 1280
export const SLIDE_H = 720

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

/** Screenshot every slide at 1280x720, in deck order, as base64 PNG. */
export async function renderSlideImages(deck) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 })
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
