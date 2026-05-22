// import PptxGenJS from 'pptxgenjs'
import puppeteer from 'puppeteer'

const PX_W = 1280
const PX_H = 720
const W = 13.333
const H = 7.5
const M = 0.67

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripUnsafeTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(?:html|head|body|link|style|iframe|img)\b[^>]*>/gi, '')
}

function textFallbackHtml(slide) {
  const bullets = Array.isArray(slide?.bullets) ? slide.bullets : []
  return `<div class="slide">
    <h1>${escapeHtml(slide?.title || 'Untitled slide')}</h1>
    ${slide?.body ? `<p>${escapeHtml(slide.body)}</p>` : ''}
    ${bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
  </div>`
}

function slideDocument({ slide, theme, index, total, deckTitle }) {
  const bg = theme?.background || '#0f0f1a'
  const primary = theme?.primary || '#7c5cff'
  const accent = theme?.accent || '#ff6ea0'
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root {
    --bg: ${bg};
    --primary: ${primary};
    --accent: ${accent};
    --fg: #ffffff;
    --muted: rgba(255,255,255,0.65);
    --soft: rgba(255,255,255,0.08);
    --softer: rgba(255,255,255,0.04);
    --hairline: rgba(255,255,255,0.12);
  }
  html, body {
    margin: 0;
    width: ${PX_W}px;
    height: ${PX_H}px;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  }
  body::before, body::after {
    content: '';
    position: absolute;
    width: 720px;
    height: 720px;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.45;
    pointer-events: none;
  }
  body::before {
    top: -260px;
    left: -240px;
    background: radial-gradient(circle, color-mix(in oklab, var(--primary) 70%, transparent), transparent 60%);
  }
  body::after {
    right: -220px;
    bottom: -280px;
    background: radial-gradient(circle, color-mix(in oklab, var(--accent) 60%, transparent), transparent 60%);
  }
  .slide {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 64px 80px 72px;
  }
  .__page-footer {
    position: absolute;
    left: 32px;
    right: 32px;
    bottom: 16px;
    z-index: 5;
    display: flex;
    justify-content: space-between;
    color: rgba(255,255,255,0.5);
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
  }
  ${String(slide?.css || '')}
</style>
</head>
<body>
${stripUnsafeTags(slide?.html) || textFallbackHtml(slide)}
<div class="__page-footer">
  <span>${escapeHtml(deckTitle)}</span>
  <span>${index + 1} / ${total}</span>
</div>
</body>
</html>`
}

async function renderSlideImages(deck) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: PX_W, height: PX_H, deviceScaleFactor: 1 })
    const slides = Array.isArray(deck?.slides) ? deck.slides : []
    const images = []
    for (let i = 0; i < slides.length; i++) {
      await page.setContent(slideDocument({
        slide: slides[i],
        theme: deck.theme || {},
        index: i,
        total: slides.length,
        deckTitle: deck.title || '',
      }), { waitUntil: 'networkidle0' })
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

  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const PptxGenJS = require('pptxgenjs')
  // If require returns the ESM wrapper (common in some bundlers), get the default export
  const PptxGen = PptxGenJS.default || PptxGenJS
  const pptx = new PptxGen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'AI Slides Generator'
  pptx.subject = deck?.subtitle || ''
  pptx.title = deck?.title || 'Deck'
  pptx.company = 'AI Slides Generator'
  pptx.lang = 'en-US'

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
    console.warn(`[export/pptx] html render failed, using text fallback: ${err.message}`)
    slides.forEach((slide, index) => addTextFallbackSlide(pptx, deck, slide, index, slides.length))
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' })
  return Buffer.from(arrayBuffer)
}
