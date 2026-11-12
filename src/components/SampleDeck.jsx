import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import HtmlSlide from './HtmlSlide.jsx'
import './SampleDeck.css'

/**
 * A real, fully rendered example deck shown to visitors who are not signed in.
 *
 * Every slide below goes through the same buildSlideDocument pipeline as the
 * stage in SlideViewer — semantic helpers, icon sprite, theme colour and page
 * footer included. Nothing here is a screenshot, so the sign-in screen shows
 * exactly what the app produces.
 */

const SAMPLE_DECK = {
  title: 'Lumen — Seed Round',
  theme: {
    name: 'Aurora',
    primary: '#7c5cff',
    accent: '#ff6ea0',
    background: '#0f0f1a',
  },
  slides: [
    {
      title: 'Waste heat, turned into watts.',
      html: `<div class="slide title-slide">
  <span class="eyebrow">Seed round · 2027</span>
  <h1>Waste heat,<br />turned into watts.</h1>
  <p class="lede">Lumen captures the exhaust every factory vents and sells it back to the grid — installed in a weekend, paid back inside a year.</p>
  <div class="sample-tags"><span class="pill accent">14 plants live</span><span class="pill">$2.4M ARR</span><span class="pill">Sequoia-backed</span></div>
</div>`,
      css: '.sample-tags { display: flex; gap: 10px; margin-top: 4px; }',
    },
    {
      title: 'The problem',
      html: `<div class="slide stats-slide">
  <header>
    <span class="eyebrow">The problem</span>
    <h2>Two thirds of the energy a plant buys leaves as heat.</h2>
  </header>
  <div class="sample-split">
    <div class="stat-grid">
      <div class="stat-card"><span class="stat-value">67%</span><span class="stat-label">of input energy vented as waste heat</span></div>
      <div class="stat-card"><span class="stat-value">$1.2M</span><span class="stat-label">lost per mid-size plant, every year</span></div>
      <div class="stat-card"><span class="stat-value">0</span><span class="stat-label">options that pay back in under three years</span></div>
    </div>
    <div data-chart="0"></div>
  </div>
</div>`,
      css: `.sample-split { display: grid; grid-template-columns: 1.02fr 0.98fr; gap: 28px; align-items: center; flex: 1; }
.sample-split .stat-grid { grid-template-columns: 1fr; gap: 12px; }
.sample-split .stat-card { padding: 16px 20px; }
.sample-split .stat-value { font-size: 38px; }
.sample-split .stat-label { font-size: 13.5px; }
.sample-split .slide-chart { max-width: none; width: 100%; }
.sample-split .slide-chart svg { width: 100%; height: auto; display: block; }`,
      charts: [
        {
          type: 'bar',
          title: 'Heat vented by plant size (MWh/yr)',
          data: [
            { label: 'Small', value: 38 },
            { label: 'Mid', value: 72 },
            { label: 'Large', value: 96 },
          ],
        },
      ],
    },
    {
      title: 'How it works',
      html: `<div class="slide steps-slide">
  <header>
    <span class="eyebrow">The product</span>
    <h2>From exhaust to grid in three steps.</h2>
  </header>
  <ol class="steps">
    <li><span class="step-num">1</span><div class="step-body"><h3>Bolt on</h3><p>A heat exchanger clamps onto the flue. No downtime, no rewiring, no permits.</p></div></li>
    <li><span class="step-num">2</span><div class="step-body"><h3>Spin up</h3><p>Our turbine turns that heat into electricity and syncs with the plant's own switchgear.</p></div></li>
    <li><span class="step-num">3</span><div class="step-body"><h3>Sell back</h3><p>Surplus flows to the grid and the plant keeps the credit. Lumen takes a slice of the savings.</p></div></li>
  </ol>
  <div class="callout"><span class="callout-label">Pilot install</span>Six weeks from site survey to switch-on, with zero production downtime.</div>
</div>`,
      css: '.steps-slide .callout { margin-top: auto; font-size: 20px; }',
    },
    {
      title: 'Proof',
      html: `<div class="slide quote-slide">
  <span class="quote-mark">&ldquo;</span>
  <blockquote>Our boiler house pays for itself now. All we had to do was stop throwing the heat away.</blockquote>
  <footer><span class="rule"></span><div class="sample-who"><strong>Dana Whitfield</strong><span>Plant Director · Northwind Foods</span></div></footer>
</div>`,
      css: `.sample-who { display: flex; flex-direction: column; gap: 4px; }
.sample-who strong { color: var(--fg); font-size: 17px; }
.sample-who span { font-size: 15px; color: var(--muted); }`,
    },
  ],
}

const SLIDE_COUNT = SAMPLE_DECK.slides.length

/**
 * Scales the canonical 1280x720 canvas into whatever width it lands in, the
 * same way the viewer rail does. Kept local so the sign-in screen doesn't
 * depend on SlideViewer's stylesheet being loaded.
 */
function SlideCanvas({ index }) {
  const hostRef = useRef(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / 1280)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="sample-canvas" ref={hostRef}>
      <div
        className="sample-canvas-zoom"
        style={{ transform: `scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}
      >
        <HtmlSlide
          slide={SAMPLE_DECK.slides[index]}
          theme={SAMPLE_DECK.theme}
          index={index}
          total={SLIDE_COUNT}
          deckTitle={SAMPLE_DECK.title}
        />
      </div>
    </div>
  )
}

/**
 * Inline card for the sign-in screen: one live slide, auto-advancing slowly,
 * with dots for jumping around. Clicking opens the full deck.
 */
export function SampleDeckCard({ onOpen }) {
  const [index, setIndex] = useState(0)
  const paused = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined
    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return
      setIndex((i) => (i + 1) % SLIDE_COUNT)
    }, 5200)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className="sample-card"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
      onFocus={() => { paused.current = true }}
      onBlur={() => { paused.current = false }}
    >
      <div className="sample-card-stage">
        <SlideCanvas index={index} />
        <span className="sample-card-badge" aria-hidden>
          <span className="sample-card-play">▶</span> Preview deck
        </span>
        <button
          type="button"
          className="sample-card-hit"
          onClick={onOpen}
          aria-label={`Preview the sample deck: ${SAMPLE_DECK.title}`}
        />
      </div>

      <div className="sample-card-meta">
        <span className="sample-card-title">{SAMPLE_DECK.title}</span>
        <span className="sample-card-count">
          {index + 1} / {SLIDE_COUNT}
        </span>
      </div>

      <div className="sample-card-dots">
        {SAMPLE_DECK.slides.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            className={`sample-dot ${i === index ? 'is-on' : ''}`}
            aria-label={`Show slide ${i + 1} of ${SLIDE_COUNT}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  )
}

/** Full-screen, keyboard-navigable view of the sample deck. */
export function SampleDeckViewer({ onClose, onSignIn }) {
  const [index, setIndex] = useState(0)
  const closeRef = useRef(null)

  const go = (delta) =>
    setIndex((i) => Math.min(SLIDE_COUNT - 1, Math.max(0, i + delta)))

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div className="sample-viewer" role="dialog" aria-modal="true" aria-label="Sample deck">
      <header className="sample-viewer-head">
        <div className="sample-viewer-brand">
          <span className="sample-viewer-mark">S</span>
          <span className="sample-viewer-name">slide<b>ai</b></span>
          <span className="sample-viewer-tag">Sample deck</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="sample-viewer-close"
          onClick={onClose}
          aria-label="Close sample deck"
        >
          ✕ <span>Close</span>
        </button>
      </header>

      <div className="sample-viewer-stage">
        <div className="sample-viewer-canvas">
          <SlideCanvas index={index} />
        </div>
      </div>

      <div className="sample-viewer-foot">
        <div className="sample-viewer-nav">
          <button
            type="button"
            className="sample-nav"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <span className="sample-viewer-count">
            {index + 1} / {SLIDE_COUNT}
          </span>
          <button
            type="button"
            className="sample-nav"
            onClick={() => go(1)}
            disabled={index === SLIDE_COUNT - 1}
            aria-label="Next slide"
          >
            ›
          </button>
        </div>

        <p className="sample-viewer-note">
          Generated from a single prompt — layout, copy and chart included.
        </p>

        <button type="button" className="sample-viewer-cta" onClick={onSignIn}>
          Create your own — free
        </button>
      </div>
    </div>
  )
}
