import { jsPDF } from 'jspdf'
import { SLIDE_W as W, SLIDE_H as H, renderSlideImages } from './slideRender.js'

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
