import { useEffect, useMemo, useRef } from 'react'
import { renderChartSvg } from '../lib/charts.js'

/**
 * Renders an AI-generated slide (slide.html + slide.css) inside a sandboxed
 * iframe sized to the canonical 1280x720 slide canvas. The host frame paints
 * the hero background image (when present) so the AI doesn't have to embed
 * <img> tags or worry about caching the data URL.
 *
 * Charts: any `<div data-chart="N"></div>` placeholders in the HTML are
 * replaced by inline SVG rendered from `slide.charts[N]` before the document
 * is written to the iframe.
 */

const SLIDE_W = 1280
const SLIDE_H = 720

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function injectCharts(html, charts, theme) {
  if (!html) return ''
  if (!Array.isArray(charts) || charts.length === 0) return html
  return html.replace(
    /<div\s+data-chart\s*=\s*["']?(\d+)["']?\s*>\s*<\/div>/gi,
    (_m, idx) => {
      const i = parseInt(idx, 10)
      const c = charts[i]
      if (!c) return ''
      return `<div class="slide-chart">${renderChartSvg(c, theme)}</div>`
    },
  )
}

function buildDocument({ html, css, charts, theme, image }) {
  const bg = theme?.background || '#0f0f1a'
  const primary = theme?.primary || '#7c5cff'
  const accent = theme?.accent || '#ff6ea0'
  const safeHtml = injectCharts(html || '', charts, theme)
  const userCss = String(css || '')
  const heroImg = image?.url
    ? `<div class="__bg-image" aria-hidden><img src="${escapeAttr(image.url)}" alt="" /><div class="__bg-tint"></div></div>`
    : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${SLIDE_W}" />
<base target="_blank" />
<style>
  :root {
    --bg: ${bg};
    --primary: ${primary};
    --accent: ${accent};
    --fg: #ffffff;
    --muted: rgba(255,255,255,0.65);
  }
  html, body {
    margin: 0;
    padding: 0;
    width: ${SLIDE_W}px;
    height: ${SLIDE_H}px;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  body { position: relative; }
  .__bg-image {
    position: absolute; inset: 0; z-index: 0;
  }
  .__bg-image img {
    width: 100%; height: 100%; object-fit: cover;
    filter: saturate(1.05) brightness(0.85);
  }
  .__bg-tint {
    position: absolute; inset: 0;
    background: linear-gradient(135deg, color-mix(in oklab, var(--bg) 88%, transparent) 0%, color-mix(in oklab, var(--bg) 50%, transparent) 100%);
  }
  /* Default .slide layer sits above hero image */
  .slide {
    position: relative; z-index: 1;
    width: 100%; height: 100%;
    box-sizing: border-box;
    padding: 64px 80px;
    display: flex; flex-direction: column;
  }
  .slide h1 { font-size: 84px; line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.02em; }
  .slide h2 { font-size: 56px; line-height: 1.1;  margin: 0 0 16px; letter-spacing: -0.015em; }
  .slide h3 { font-size: 32px; line-height: 1.2;  margin: 0 0 12px; }
  .slide p  { font-size: 24px; line-height: 1.4;  margin: 0 0 12px; color: var(--muted); }
  .slide ul, .slide ol { margin: 0; padding-left: 1.4em; }
  .slide li { font-size: 24px; line-height: 1.45; margin: 6px 0; }
  .slide blockquote { font-size: 36px; line-height: 1.3; margin: 0; font-weight: 600; }
  .slide a { color: var(--accent); }
  .slide-chart { width: 100%; max-width: 720px; }
  /* Author CSS comes last so it can override defaults */
  ${userCss}
</style>
</head>
<body>
${heroImg}
${safeHtml}
</body>
</html>`
}

export default function HtmlSlide({ slide, theme }) {
  const iframeRef = useRef(null)

  const docHtml = useMemo(
    () =>
      buildDocument({
        html: slide?.html,
        css: slide?.css,
        charts: slide?.charts,
        theme,
        image: slide?.image,
      }),
    [slide?.html, slide?.css, slide?.charts, slide?.image, theme?.background, theme?.primary, theme?.accent],
  )

  // Setting srcdoc directly via React caused some quirks with caching of the
  // base64 image; assign it imperatively so the iframe always reloads.
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = docHtml
    }
  }, [docHtml])

  return (
    <iframe
      ref={iframeRef}
      title={slide?.title || 'Slide'}
      className="html-slide-frame"
      sandbox="allow-same-origin"
      style={{
        width: `${SLIDE_W}px`,
        height: `${SLIDE_H}px`,
        border: 0,
        background: theme?.background || '#0f0f1a',
        display: 'block',
      }}
    />
  )
}

export function buildSlideDocument(slide, theme) {
  return buildDocument({
    html: slide?.html,
    css: slide?.css,
    charts: slide?.charts,
    theme,
    image: slide?.image,
  })
}
