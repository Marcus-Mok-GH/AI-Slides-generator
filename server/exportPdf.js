import { jsPDF } from 'jspdf'

const W = 1280
const H = 720
const M = 64

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

function slideDocument({ slide, theme, index, total, deckTitle }) {
  const bg = theme?.background || '#0f0f1a'
  const primary = theme?.primary || '#7c5cff'
  const accent = theme?.accent || '#ff6ea0'
  const html = stripUnsafeTags(slide.html)
  const css = String(slide.css || '')
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
    width: ${W}px;
    height: ${H}px;
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
  ${css}
</style>
</head>
<body>
${html || textFallbackHtml(slide)}
<div class="__page-footer">
  <span>${escapeHtml(deckTitle)}</span>
  <span>${index + 1} / ${total}</span>
</div>
</body>
</html>`
}

function textFallbackHtml(slide) {
  const bullets = Array.isArray(slide?.bullets) ? slide.bullets : []
  return `<div class="slide">
    <h1>${escapeHtml(slide?.title || 'Untitled slide')}</h1>
    ${slide?.body ? `<p>${escapeHtml(slide.body)}</p>` : ''}
    ${bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
  </div>`
}

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

async function getBrowser() {
  // Try to launch with serverless-friendly chromium if available
  let puppeteerCore
  try {
    puppeteerCore = (await import('puppeteer-core')).default || (await import('puppeteer-core'))
  } catch {
    throw new Error('puppeteer-core not installed')
  }

  let executablePath
  let args = ['--no-sandbox', '--disable-setuid-sandbox']

  // On Vercel, try @sparticuz/chromium
  try {
    const chromium = await import('@sparticuz/chromium').then(m => m.default || m)
    // chromium package may be minified version
    executablePath = await chromium.executablePath()
    args = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox']
  } catch {
    // chromium not available — will try local Chrome if puppeteer-core can find it,
    // otherwise this will throw and caller falls back to text rendering
  }

  const launchOpts = {
    headless: true,
    args,
  }
  if (executablePath) launchOpts.executablePath = executablePath

  return puppeteerCore.launch(launchOpts)
}

async function renderSlideImages(deck) {
  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
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
    await browser.close().catch(() => {})
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

  try {
    const images = await renderSlideImages(deck)
    images.forEach((base64, index) => {
      if (index > 0) pdf.addPage([W, H], 'landscape')
      pdf.addImage(`data:image/png;base64,${base64}`, 'PNG', 0, 0, W, H)
    })
  } catch (err) {
    console.warn(`[export/pdf] html render failed, using text fallback: ${err.message}`)
    slides.forEach((slide, index) => {
      if (index > 0) pdf.addPage([W, H], 'landscape')
      addTextFallbackPage(pdf, slide, deck.theme || {}, index, slides.length, deck.title || '')
    })
  }

  return Buffer.from(pdf.output('arraybuffer'))
}
