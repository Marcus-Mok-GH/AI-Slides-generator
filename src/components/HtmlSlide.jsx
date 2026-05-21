import { useEffect, useMemo, useRef } from 'react'
import { renderChartSvg } from '../lib/charts.js'

/**
 * Renders an AI-generated slide (slide.html + slide.css) inside a sandboxed
 * iframe sized to the canonical 1280x720 slide canvas. The AI generates the
 * entire slide visual from scratch — there is no background photo layered
 * behind it; every pixel is carried by the model's HTML and CSS.
 *
 * Design language: Gamma-inspired. Every slide gets:
 *   - A built-in icon sprite the AI can reference with <svg class="icon"><use href="#i-NAME"/></svg>
 *   - A library of utility classes (.card, .pill, .badge, .number-badge,
 *     .accent-bar, .eyebrow, .dot-grid, .callout, .divider) so slides look
 *     polished even when the model emits modest CSS.
 *   - An auto-injected footer (slide # / total · deck title).
 *   - Subtle decorative gradient blobs that pick up the deck theme.
 *
 * Charts: any `<div data-chart="N"></div>` placeholders in the HTML are
 * replaced by inline SVG rendered from `slide.charts[N]` before the document
 * is written to the iframe.
 */

const SLIDE_W = 1280
const SLIDE_H = 720

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}


function normalizeSlideHtml(html) {
  const raw = String(html || '').trim()
  if (!raw) return ''

  // Accept accidental full-document responses from the model and keep only body content.
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const core = (bodyMatch ? bodyMatch[1] : raw).trim()

  // If the model already emitted a .slide root, preserve it unchanged.
  if (/^\s*<\w+[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>/i.test(core)) {
    return core
  }

  // Otherwise, wrap content so baseline layout rules still apply.
  return `<div class="slide">${core}</div>`
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

/* ------------------------------------------------------------------
 * Icon sprite (Lucide / Heroicons-inspired line icons).
 * Drop in a slide via:  <svg class="icon"><use href="#i-rocket"/></svg>
 * Sized via the .icon class which inherits currentColor.
 * Keep the sprite small — ~30 of the most useful presentation icons.
 * ------------------------------------------------------------------ */
const ICON_SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-arrow-up" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-arrow-down" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-rocket" viewBox="0 0 24 24"><path d="M14 4s5 0 6 6c-6 1-6 6-6 6s-3-1-5-3-3-5-3-5 4-1 8-4z M9 13l-3 3M14 4l6 6M5 19s1-2 3-2M19 19s-2 1-2 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></symbol>
    <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-bulb" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c1 1 1.5 1.5 1.5 3h5c0-1.5.5-2 1.5-3A6 6 0 0012 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 12c0 .5 0 1-.1 1.5l2 1.6-2 3.4-2.4-1a7 7 0 01-2.6 1.5l-.4 2.5h-4l-.4-2.5a7 7 0 01-2.6-1.5l-2.4 1-2-3.4 2-1.6c-.1-.5-.1-1-.1-1.5s0-1 .1-1.5l-2-1.6 2-3.4 2.4 1a7 7 0 012.6-1.5L10 3h4l.4 2.5a7 7 0 012.6 1.5l2.4-1 2 3.4-2 1.6c.1.5.1 1 .1 1.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 14c3.3.4 6 2.6 6 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V8M10 20V4M16 20v-8M22 20H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-trend" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M21 7v6h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-dollar" viewBox="0 0 24 24"><path d="M12 3v18M17 7H9.5a3 3 0 100 6h5a3 3 0 110 6H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
    <symbol id="i-cloud" viewBox="0 0 24 24"><path d="M7 18a4 4 0 010-8 6 6 0 0111-2 4 4 0 01.5 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-code" viewBox="0 0 24 24"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-document" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6 M9 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></symbol>
    <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
    <symbol id="i-quote" viewBox="0 0 24 24"><path d="M7 7h4v4H7c0 3 0 4 4 5v2c-6-1-7-4-7-7V7zM15 7h4v4h-4c0 3 0 4 4 5v2c-6-1-7-4-7-7V7z" fill="currentColor"/></symbol>
  </defs>
</svg>`.trim()

function buildDocument({
  html,
  css,
  charts,
  theme,
  index,
  total,
  deckTitle,
}) {
  const bg = theme?.background || '#0f0f1a'
  const primary = theme?.primary || '#7c5cff'
  const accent = theme?.accent || '#ff6ea0'
  const safeHtml = injectCharts(normalizeSlideHtml(html), charts, theme)
  const userCss = String(css || '')

  const showFooter = typeof index === 'number' && typeof total === 'number'
  const footerLeft = deckTitle ? escapeText(deckTitle) : ''
  const footer = showFooter
    ? `<div class="__page-footer" aria-hidden>
         ${footerLeft ? `<span class="__footer-title">${footerLeft}</span>` : ''}
         <span class="__footer-num">${index + 1} <span class="__footer-sep">/</span> ${total}</span>
       </div>`
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
    --soft: rgba(255,255,255,0.08);
    --softer: rgba(255,255,255,0.04);
    --hairline: rgba(255,255,255,0.12);
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

  /* Decorative ambient gradient blobs that pick up the theme.
     Keeps every slide from feeling like a flat block of color. */
  body::before, body::after {
    content: '';
    position: absolute; pointer-events: none; z-index: 0;
    width: 720px; height: 720px; border-radius: 50%;
    filter: blur(120px); opacity: 0.55;
  }
  body::before {
    top: -260px; left: -240px;
    background: radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--primary) 70%, transparent) 0%, transparent 60%);
  }
  body::after {
    bottom: -280px; right: -200px;
    background: radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--accent) 60%, transparent) 0%, transparent 60%);
  }

  /* Page footer (slide # / total · deck title) — Gamma-style */
  .__page-footer {
    position: absolute; left: 0; right: 0; bottom: 0;
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 32px; z-index: 5;
    font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(255,255,255,0.45); pointer-events: none;
    font-feature-settings: "tnum" 1;
  }
  .__footer-title {
    max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .__footer-num { font-weight: 600; color: rgba(255,255,255,0.65); }
  .__footer-sep { opacity: 0.4; margin: 0 4px; }

  /* Default .slide layer sits above hero image and decorations */
  .slide {
    position: relative; z-index: 1;
    width: 100%; height: 100%;
    box-sizing: border-box;
    padding: 64px 80px 72px;
    display: flex; flex-direction: column;
  }
  .slide h1 { font-size: 84px; line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.02em; font-weight: 700; }
  .slide h2 { font-size: 56px; line-height: 1.1;  margin: 0 0 16px; letter-spacing: -0.015em; font-weight: 700; }
  .slide h3 { font-size: 28px; line-height: 1.2;  margin: 0 0 8px; font-weight: 600; }
  .slide h4 { font-size: 20px; line-height: 1.25; margin: 0 0 6px; font-weight: 600; }
  .slide p  { font-size: 22px; line-height: 1.45; margin: 0 0 12px; color: var(--muted); }
  .slide ul, .slide ol { margin: 0; padding-left: 1.4em; }
  .slide li { font-size: 22px; line-height: 1.5; margin: 8px 0; }
  .slide blockquote { font-size: 36px; line-height: 1.3; margin: 0; font-weight: 600; }
  .slide a { color: var(--accent); }
  .slide-chart { width: 100%; max-width: 720px; }

  /* ----------------------------------------------------------------
     Gamma-style utility primitives. Slides are encouraged to use
     these instead of inventing new names — gives the deck a
     consistent feel even when the AI emits modest CSS.
     ---------------------------------------------------------------- */

  /* Eyebrow tag — uppercase letter-spaced label above headlines */
  .slide .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin: 0 0 18px;
  }
  .slide .eyebrow::before {
    content: ''; display: inline-block; width: 24px; height: 2px;
    background: var(--accent); border-radius: 2px;
  }

  /* Pills — small rounded labels */
  .slide .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 999px;
    background: color-mix(in oklab, var(--primary) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--primary) 30%, transparent);
    color: var(--fg); font-size: 14px; font-weight: 500; letter-spacing: 0.02em;
  }
  .slide .pill.accent {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
    border-color: color-mix(in oklab, var(--accent) 30%, transparent);
  }

  /* Accent vertical bar — drop next to a headline */
  .slide .accent-bar {
    width: 4px; height: 56px; border-radius: 4px;
    background: linear-gradient(180deg, var(--primary), var(--accent));
  }

  /* Big numeric badge "01" — for sections, steps, hero numbers */
  .slide .number-badge {
    font-feature-settings: "tnum" 1;
    font-size: 96px; line-height: 1; font-weight: 800;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text; background-clip: text;
    color: transparent; letter-spacing: -0.04em;
  }
  .slide .number-badge.sm { font-size: 56px; }

  /* Glass card — the workhorse Gamma card */
  .slide .card {
    background: var(--softer);
    border: 1px solid var(--hairline);
    border-radius: 20px;
    padding: 24px 26px;
    backdrop-filter: blur(12px);
    display: flex; flex-direction: column; gap: 10px;
  }
  .slide .card.featured {
    background: linear-gradient(140deg,
      color-mix(in oklab, var(--primary) 22%, transparent),
      color-mix(in oklab, var(--accent) 14%, transparent));
    border-color: color-mix(in oklab, var(--primary) 35%, transparent);
  }
  .slide .card .card-icon {
    width: 44px; height: 44px; border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    background: color-mix(in oklab, var(--primary) 22%, transparent);
    color: var(--accent);
  }
  .slide .card h3 { font-size: 22px; margin: 4px 0 4px; color: var(--fg); }
  .slide .card p  { font-size: 16px; line-height: 1.5; color: var(--muted); margin: 0; }

  /* Card grid — responsive Gamma tiles */
  .slide .card-grid {
    display: grid; gap: 18px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .slide .card-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .slide .card-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .slide .card-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

  /* Callout block — highlight with accent left border */
  .slide .callout {
    border-left: 4px solid var(--accent);
    background: color-mix(in oklab, var(--accent) 10%, transparent);
    padding: 22px 26px; border-radius: 0 16px 16px 0;
    font-size: 22px; line-height: 1.45; color: var(--fg);
  }
  .slide .callout .callout-label {
    display: block; font-size: 12px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--accent);
    font-weight: 700; margin-bottom: 8px;
  }

  /* Divider rule with optional inline label */
  .slide .divider {
    height: 1px; background: var(--hairline); margin: 16px 0;
  }
  .slide .divider.with-label {
    display: flex; align-items: center; gap: 14px;
    background: transparent; height: auto;
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em;
    color: var(--muted);
  }
  .slide .divider.with-label::before,
  .slide .divider.with-label::after {
    content: ''; flex: 1; height: 1px; background: var(--hairline);
  }

  /* Dot grid texture — subtle decorative background */
  .slide .dot-grid {
    background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1.5px);
    background-size: 16px 16px;
  }

  /* Stat block — big number + caption */
  .slide .stat {
    display: flex; flex-direction: column; gap: 6px;
  }
  .slide .stat .stat-value {
    font-size: 72px; line-height: 1; font-weight: 800;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text; background-clip: text;
    color: transparent; letter-spacing: -0.03em;
    font-feature-settings: "tnum" 1;
  }
  .slide .stat .stat-label {
    font-size: 14px; color: var(--muted); letter-spacing: 0.04em;
  }

  /* Process / timeline node row */
  .slide .process {
    display: grid; gap: 16px;
    grid-auto-flow: column; grid-auto-columns: 1fr;
    align-items: stretch;
  }
  .slide .process .node {
    background: var(--softer); border: 1px solid var(--hairline);
    border-radius: 18px; padding: 22px;
    display: flex; flex-direction: column; gap: 8px;
    position: relative;
  }
  .slide .process .node + .node::before {
    content: '→'; position: absolute; left: -22px; top: 50%;
    transform: translateY(-50%);
    color: var(--accent); font-size: 24px; font-weight: 700;
  }
  .slide .process .node .node-num {
    font-size: 14px; font-weight: 700; color: var(--accent);
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .slide .process .node h3 { font-size: 20px; margin: 0; }
  .slide .process .node p { font-size: 15px; margin: 0; color: var(--muted); }

  /* Timeline (vertical) */
  .slide .timeline { display: flex; flex-direction: column; gap: 18px; }
  .slide .timeline .event {
    display: grid; grid-template-columns: 110px 1fr; gap: 24px;
    align-items: start; padding-left: 18px;
    border-left: 2px solid var(--hairline); position: relative;
  }
  .slide .timeline .event::before {
    content: ''; position: absolute; left: -8px; top: 8px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 25%, transparent);
  }
  .slide .timeline .event .when {
    font-size: 16px; font-weight: 700; color: var(--accent);
    letter-spacing: 0.04em;
  }
  .slide .timeline .event .what h3 { margin: 0 0 4px; font-size: 22px; }
  .slide .timeline .event .what p { font-size: 16px; margin: 0; color: var(--muted); }

  /* Inline icons — referenced via <svg class="icon"><use href="#i-..."/></svg> */
  .slide .icon {
    width: 1em; height: 1em;
    display: inline-block; vertical-align: -0.125em;
    color: currentColor; flex-shrink: 0;
  }
  .slide .icon.lg { width: 1.5em; height: 1.5em; }
  .slide .icon.xl { width: 2em; height: 2em; }

  /* Headline gradient text — opt-in via .gradient-text */
  .slide .gradient-text {
    background: linear-gradient(120deg, var(--fg), var(--accent) 70%);
    -webkit-background-clip: text; background-clip: text;
    color: transparent;
  }

  /* ----------------------------------------------------------------
     Layout-specific semantic helpers.
     Using these means the AI only needs to emit the scaffold HTML —
     the visual treatment is already wired in.
     ---------------------------------------------------------------- */

  /* Title / hero slide */
  .title-slide {
    display: flex; flex-direction: column; justify-content: flex-end;
    gap: 0;
  }
  .title-slide .eyebrow { margin-bottom: 24px; }
  .title-slide h1 {
    font-size: 92px; line-height: 1.02; letter-spacing: -0.03em;
    font-weight: 800; margin: 0 0 20px;
    max-width: 18ch;
  }
  .slide .lede {
    font-size: 26px; line-height: 1.5; color: var(--muted);
    margin: 0 0 32px; max-width: 52ch;
  }
  .slide .meta-row {
    display: flex; align-items: center; gap: 14px;
    font-size: 15px; color: rgba(255,255,255,0.45);
    letter-spacing: 0.06em;
  }
  .slide .meta-row span { white-space: nowrap; }

  /* Section divider slide */
  .section-slide {
    display: flex; flex-direction: column; justify-content: center;
    position: relative; overflow: hidden;
  }
  .slide .section-index {
    font-size: 200px; font-weight: 900; line-height: 1; letter-spacing: -0.04em;
    position: absolute; right: 60px; top: 50%; transform: translateY(-50%);
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    opacity: 0.15; pointer-events: none; user-select: none;
    font-feature-settings: "tnum" 1;
  }
  .slide .section-eyebrow {
    font-size: 14px; font-weight: 700; letter-spacing: 0.24em;
    text-transform: uppercase; color: var(--accent);
    margin-bottom: 18px; display: block;
  }
  .section-slide h1 {
    font-size: 96px; line-height: 1; letter-spacing: -0.035em;
    font-weight: 800; margin: 0; max-width: 14ch;
  }
  .section-slide .accent-bar { margin-top: 28px; height: 6px; width: 80px; }

  /* Statement slide */
  .statement-slide {
    display: flex; flex-direction: column; justify-content: center;
    padding-top: 80px;
  }
  .slide .quote-mark {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 160px; line-height: 0.6; color: var(--accent);
    opacity: 0.7; margin-bottom: -24px; display: block;
    font-weight: 400;
  }
  .slide .statement {
    font-size: 72px; line-height: 1.06; letter-spacing: -0.025em;
    font-weight: 800; margin: 0 0 24px; max-width: 20ch; color: var(--fg);
  }
  .slide .elaboration {
    font-size: 24px; line-height: 1.55; color: var(--muted);
    max-width: 56ch; margin: 0;
  }

  /* Bullets slide */
  .bullets-slide header { margin-bottom: 28px; }
  .bullets-slide header h2 { margin: 0; }
  .slide .bullets {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 14px;
  }
  .slide .bullets li {
    display: flex; align-items: flex-start; gap: 16px;
    font-size: 22px; line-height: 1.45; color: rgba(255,255,255,0.9);
    margin: 0;
  }
  .slide .bullets .dot {
    flex-shrink: 0; width: 10px; height: 10px; margin-top: 8px;
    border-radius: 3px;
    background: linear-gradient(135deg, var(--primary), var(--accent));
  }
  .slide .bullets .text { flex: 1; }

  /* Steps slide */
  .steps-slide h2 { margin-bottom: 28px; }
  .slide .steps {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 16px;
  }
  .slide .steps li {
    display: flex; align-items: flex-start; gap: 20px;
    padding: 16px 20px; border-radius: 14px;
    background: var(--softer); border: 1px solid var(--hairline);
    margin: 0;
  }
  .slide .step-num {
    flex-shrink: 0; width: 36px; height: 36px; border-radius: 999px;
    display: grid; place-items: center; font-weight: 700; font-size: 15px;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    color: #fff;
  }
  .slide .step-body h3 { font-size: 20px; margin: 0 0 4px; color: var(--fg); }
  .slide .step-body p { font-size: 16px; margin: 0; color: var(--muted); }

  /* Comparison slide */
  .comparison-slide h2 { margin-bottom: 24px; }
  .slide .cmp-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    flex: 1;
  }
  .slide .cmp-col {
    padding: 22px 24px; border-radius: 18px; display: flex;
    flex-direction: column; gap: 14px;
    background: var(--softer); border: 1px solid var(--hairline);
  }
  .slide .cmp-col.cmp-left { border-left: 3px solid rgba(255,255,255,0.2); }
  .slide .cmp-col.cmp-right { border-left: 3px solid var(--accent); }
  .slide .cmp-label {
    font-size: 13px; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: rgba(255,255,255,0.6);
  }
  .slide .cmp-col.cmp-right .cmp-label { color: var(--accent); }
  .slide .cmp-col ul {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .slide .cmp-col li {
    padding-left: 18px; position: relative;
    font-size: 18px; line-height: 1.45; color: rgba(255,255,255,0.88); margin: 0;
  }
  .slide .cmp-col li::before {
    content: ''; position: absolute; left: 0; top: 9px;
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(255,255,255,0.45);
  }
  .slide .cmp-col.cmp-right li::before { background: var(--accent); }

  /* Stats slide */
  .stats-slide header { margin-bottom: 28px; }
  .stats-slide header h2 { margin: 0; }
  .slide .stat-grid {
    display: grid; gap: 18px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    flex: 1; align-content: start;
  }
  .slide .stat-card {
    padding: 26px 24px; border-radius: 18px;
    background: var(--softer); border: 1px solid var(--hairline);
    display: flex; flex-direction: column; gap: 8px;
    transition: background 0.2s;
  }
  .slide .stat-card .stat-value {
    font-size: 56px; line-height: 1; font-weight: 800;
    letter-spacing: -0.025em; font-feature-settings: "tnum" 1;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .slide .stat-card .stat-label {
    font-size: 15px; color: var(--muted); letter-spacing: 0.02em;
    line-height: 1.4;
  }

  /* Quote slide */
  .quote-slide {
    display: flex; flex-direction: column; justify-content: center;
    gap: 0; padding-top: 60px;
  }
  .quote-slide .quote-mark {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 120px; line-height: 0.6; color: var(--accent);
    opacity: 0.65; display: block; margin-bottom: -20px;
  }
  .quote-slide blockquote {
    font-size: 42px; line-height: 1.28; font-weight: 600;
    margin: 0 0 28px; letter-spacing: -0.012em;
    max-width: 22ch; color: var(--fg);
  }
  .quote-slide footer {
    display: flex; align-items: center; gap: 20px;
    font-size: 16px; color: var(--muted);
  }
  .slide .rule {
    display: inline-block; width: 32px; height: 2px;
    background: var(--accent); border-radius: 2px; flex-shrink: 0;
  }

  /* Two-column slide */
  .two-col-slide header { margin-bottom: 24px; }
  .two-col-slide header h2 { margin: 0; }
  .two-col-slide .cols {
    display: grid; grid-template-columns: 1fr 1fr; gap: 36px;
    flex: 1; align-items: start;
  }
  .two-col-slide .prose p {
    font-size: 22px; line-height: 1.6; color: var(--muted);
  }

  /* Content slide */
  .content-slide .body {
    font-size: 24px; line-height: 1.6; color: var(--muted);
    max-width: 60ch;
  }

  /* Feature cards slide */
  .feature-cards-slide header { margin-bottom: 28px; }
  .feature-cards-slide header h2 { margin: 0; }

  /* Grid texture overlay — add class="grid-bg" to .slide wrapper */
  .slide.grid-bg::before {
    content: '';
    position: absolute; inset: 0; z-index: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
  }

  /* Author CSS comes last so it can override defaults */
  ${userCss}
</style>
</head>
<body>
${ICON_SPRITE}
${safeHtml}
${footer}
</body>
</html>`
}

export default function HtmlSlide({ slide, theme, index, total, deckTitle }) {
  const iframeRef = useRef(null)

  const docHtml = useMemo(
    () =>
      buildDocument({
        html: slide?.html,
        css: slide?.css,
        charts: slide?.charts,
        theme,
        index,
        total,
        deckTitle,
      }),
    [
      slide?.html,
      slide?.css,
      slide?.charts,
      theme?.background,
      theme?.primary,
      theme?.accent,
      index,
      total,
      deckTitle,
    ],
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

export function buildSlideDocument(slide, theme, opts = {}) {
  return buildDocument({
    html: slide?.html,
    css: slide?.css,
    charts: slide?.charts,
    theme,
    index: opts.index,
    total: opts.total,
    deckTitle: opts.deckTitle,
  })
}
