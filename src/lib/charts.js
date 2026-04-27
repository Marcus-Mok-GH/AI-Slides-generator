/**
 * Tiny dependency-free SVG chart renderer.
 *
 * Used by HtmlSlide to fill <div data-chart="N"></div> placeholders the AI
 * leaves in slide HTML, and by the PPTX exporter to embed real chart objects.
 *
 * Each chart spec: { type: 'bar' | 'line' | 'pie', title, data: [{label, value}] }
 */

const PIE_COLORS = (primary, accent) => [
  primary,
  accent,
  mix(primary, '#ffffff', 0.35),
  mix(accent, '#ffffff', 0.35),
  mix(primary, accent, 0.5),
  mix(primary, '#000000', 0.25),
]

function mix(a, b, t) {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  if (!pa || !pb) return a
  const r = Math.round(pa.r + (pb.r - pa.r) * t)
  const g = Math.round(pa.g + (pb.g - pa.g) * t)
  const bl = Math.round(pa.b + (pb.b - pa.b) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function fmt(v) {
  if (Math.abs(v) >= 1000) return `${Math.round(v)}`
  return String(v)
}

export function renderChartSvg(chart, theme = {}) {
  const primary = theme.primary || '#7c5cff'
  const accent = theme.accent || '#ff6ea0'
  if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) return ''

  if (chart.type === 'pie') return renderPie(chart, primary, accent)
  if (chart.type === 'line') return renderLine(chart, primary, accent)
  return renderBar(chart, primary, accent)
}

function chartTitle(title) {
  if (!title) return ''
  return `<text x="20" y="28" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" fill="currentColor">${escapeXml(title)}</text>`
}

function renderBar(chart, primary, accent) {
  const W = 640
  const H = 360
  const padL = 56
  const padR = 24
  const padT = chart.title ? 56 : 24
  const padB = 56
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const max = Math.max(...chart.data.map((d) => d.value), 1)
  const n = chart.data.length
  const gap = 14
  const barW = (innerW - gap * (n - 1)) / n

  const yTicks = 4
  const tickStep = max / yTicks

  let bars = ''
  let labels = ''
  chart.data.forEach((d, i) => {
    const h = (d.value / max) * innerH
    const x = padL + i * (barW + gap)
    const y = padT + innerH - h
    const fill = i % 2 === 0 ? primary : accent
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${fill}" />`
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="currentColor">${fmt(d.value)}</text>`
    labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${(padT + innerH + 22).toFixed(1)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="currentColor" opacity="0.8">${escapeXml(d.label)}</text>`
  })

  let grid = ''
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (innerH / yTicks) * i
    const v = max - tickStep * i
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" />`
    grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="11" fill="currentColor" opacity="0.55">${fmt(v)}</text>`
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bar chart" style="width:100%;height:auto;color:var(--fg,#fff)">${chartTitle(chart.title)}${grid}${bars}${labels}</svg>`
}

function renderLine(chart, primary, accent) {
  const W = 640
  const H = 360
  const padL = 56
  const padR = 24
  const padT = chart.title ? 56 : 24
  const padB = 56
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const max = Math.max(...chart.data.map((d) => d.value), 1)
  const min = Math.min(...chart.data.map((d) => d.value), 0)
  const range = max - min || 1
  const n = chart.data.length

  const points = chart.data.map((d, i) => {
    const x = padL + (i / Math.max(n - 1, 1)) * innerW
    const y = padT + innerH - ((d.value - min) / range) * innerH
    return [x, y]
  })

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ')

  const area = `M${points[0][0].toFixed(1)},${(padT + innerH).toFixed(1)} ` +
    points.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
    ` L${points[points.length - 1][0].toFixed(1)},${(padT + innerH).toFixed(1)} Z`

  const yTicks = 4
  let grid = ''
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (innerH / yTicks) * i
    const v = max - (range / yTicks) * i
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" />`
    grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="11" fill="currentColor" opacity="0.55">${fmt(v)}</text>`
  }

  let dots = ''
  let labels = ''
  points.forEach((p, i) => {
    dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="${accent}" stroke="${primary}" stroke-width="2" />`
    labels += `<text x="${p[0].toFixed(1)}" y="${(padT + innerH + 22).toFixed(1)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="13" fill="currentColor" opacity="0.8">${escapeXml(chart.data[i].label)}</text>`
  })

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Line chart" style="width:100%;height:auto;color:var(--fg,#fff)">
${chartTitle(chart.title)}
${grid}
<path d="${area}" fill="${primary}" fill-opacity="0.18" />
<path d="${path}" fill="none" stroke="${primary}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
${dots}
${labels}
</svg>`
}

function renderPie(chart, primary, accent) {
  const W = 640
  const H = 360
  const cx = 200
  const cy = chart.title ? 200 : 180
  const r = 130
  const total = chart.data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1
  const colors = PIE_COLORS(primary, accent)

  let angle = -Math.PI / 2
  let slices = ''
  let legend = ''
  chart.data.forEach((d, i) => {
    const frac = Math.max(d.value, 0) / total
    const next = angle + frac * Math.PI * 2
    const large = frac > 0.5 ? 1 : 0
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(next)
    const y2 = cy + r * Math.sin(next)
    const path = `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`
    slices += `<path d="${path}" fill="${colors[i % colors.length]}" stroke="var(--bg,#0f0f1a)" stroke-width="2" />`

    const ly = chart.title ? 64 + i * 30 : 32 + i * 30
    legend += `<rect x="380" y="${ly}" width="14" height="14" rx="3" fill="${colors[i % colors.length]}" />`
    legend += `<text x="404" y="${ly + 12}" font-family="Inter, system-ui, sans-serif" font-size="14" fill="currentColor">${escapeXml(d.label)} <tspan opacity="0.6">${Math.round(frac * 100)}%</tspan></text>`
    angle = next
  })

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pie chart" style="width:100%;height:auto;color:var(--fg,#fff)">${chartTitle(chart.title)}${slices}${legend}</svg>`
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
