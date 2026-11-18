import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import HtmlSlide from './HtmlSlide.jsx'
import './SampleDeck.css'

/**
 * Real, fully rendered example decks shown to visitors who are not signed in.
 *
 * Every slide below goes through the same buildSlideDocument pipeline as the
 * stage in SlideViewer — semantic helpers, icon sprite, theme colour and page
 * footer included. Nothing here is a screenshot, so the sign-in screen shows
 * exactly what the app produces.
 *
 * Three decks, not one: a visitor planning a board review or an onboarding
 * session needs to see their own kind of deck before they will pay for one.
 * Each deck is four slides, so the viewer's picker stays a quick browse.
 */

const SAMPLE_TAGS_CSS = '.sample-tags { display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap; }'

const SAMPLE_SPLIT_CSS = `.sample-split { display: grid; grid-template-columns: 1.02fr 0.98fr; gap: 28px; align-items: center; flex: 1; }
.sample-split .stat-grid { grid-template-columns: 1fr; gap: 12px; }
.sample-split .stat-card { padding: 16px 20px; }
.sample-split .stat-value { font-size: 38px; }
.sample-split .stat-label { font-size: 13.5px; }
.sample-split .slide-chart { max-width: none; width: 100%; }
.sample-split .slide-chart svg { width: 100%; height: auto; display: block; }`

const SAMPLE_WHO_CSS = `.sample-who { display: flex; flex-direction: column; gap: 4px; }
.sample-who strong { color: var(--fg); font-size: 17px; }
.sample-who span { font-size: 15px; color: var(--muted); }`

export const SAMPLE_DECKS = [
  {
    id: 'pitch',
    label: 'Pitch deck',
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
        notes:
          'Open on the two numbers the room cares about — 14 plants live and $2.4M ARR, both from a standing start 26 months ago. The line to land before slide 2: we are not selling a turbine, we are selling heat the plant has already paid for. Hold the $18M and the 18-month use of funds for the ask; the traction detail earns the right to it.',
        html: `<div class="slide title-slide">
  <span class="eyebrow">Seed round · 2027</span>
  <h1>Waste heat,<br />turned into watts.</h1>
  <p class="lede">Lumen captures the exhaust every factory vents and sells it back to the grid — installed in a weekend, paid back inside a year.</p>
  <div class="sample-tags"><span class="pill accent">14 plants live</span><span class="pill">$2.4M ARR</span><span class="pill">Sequoia-backed</span></div>
</div>`,
        css: SAMPLE_TAGS_CSS,
      },
      {
        title: 'The problem',
        notes:
          'Attribute the numbers before anyone asks: 67% is the industry average from the 2025 waste-heat inventory, while the $1.2M is our own model for a plant burning 40 GWh a year at $0.08/kWh. Say that out loud — it is the difference between a stat and a claim. The chart is sized by plant, not by year, because "we are too small for this" is the objection we hear most.',
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
        css: SAMPLE_SPLIT_CSS,
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
        notes:
          'Walk the three steps in one breath, then spend the time on the pilot rather than the hardware: six weeks, zero production downtime, and the switchgear work is the only part the plant has to staff itself. If the room is operational rather than financial, close this slide by offering the flue survey — a two-hour visit, free, and it produces the payback number for their own building.',
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
        notes:
          'Read the quote, then stop talking and let it sit. Dana was a two-year no who finally ran the pilot on a single boiler, so the credibility is in the resistance, not the yes — mention that if the room pushes back. Then go straight to the ask; this is the last slide that does any persuading.',
        html: `<div class="slide quote-slide">
  <span class="quote-mark">&ldquo;</span>
  <blockquote>Our boiler house pays for itself now. All we had to do was stop throwing the heat away.</blockquote>
  <footer><span class="rule"></span><div class="sample-who"><strong>Dana Whitfield</strong><span>Plant Director · Northwind Foods</span></div></footer>
</div>`,
        css: SAMPLE_WHO_CSS,
      },
    ],
  },
  {
    id: 'review',
    label: 'Q3 review',
    title: 'Northwind — Q3 Review',
    theme: {
      name: 'Tide',
      primary: '#2f9e8f',
      accent: '#ffb454',
      background: '#0b1e24',
    },
    slides: [
      {
        title: 'Three points ahead of plan.',
        notes:
          'This is a board that has heard "ahead of plan" before, so lead with the number and then immediately name the one bet that is behind. Saying it before they ask is what buys you the rest of the hour. Keep the runway figure in your back pocket for the finance question; it is on the slide so you do not have to read it out.',
        html: `<div class="slide title-slide">
  <span class="eyebrow">Q3 2026 · Board update</span>
  <h1>Three points ahead<br />of plan, one bet behind.</h1>
  <p class="lede">Northwind closed Q3 at $8.4M ARR, added 41 teams, and finally cleared the onboarding backlog that flattened Q2.</p>
  <div class="sample-tags"><span class="pill accent">$8.4M ARR</span><span class="pill">118% net revenue retention</span><span class="pill">22 months runway</span></div>
</div>`,
        css: SAMPLE_TAGS_CSS,
      },
      {
        title: 'The quarter in numbers',
        notes:
          'Lead with net new MRR rather than the ARR headline: it is the number that shows the engine, and it is the one the board will re-derive on their own. The four lost logos are procurement theatre, not product loss — say that plainly, then move to the chart, which is what Q4 is modelled on.',
        html: `<div class="slide stats-slide">
  <header>
    <span class="eyebrow">The quarter</span>
    <h2>Growth held. Procurement did not.</h2>
  </header>
  <div class="sample-split">
    <div class="stat-grid">
      <div class="stat-card"><span class="stat-value">+21%</span><span class="stat-label">ARR growth, quarter over quarter</span></div>
      <div class="stat-card"><span class="stat-value">$61k</span><span class="stat-label">net new MRR, the best quarter this year</span></div>
      <div class="stat-card"><span class="stat-value">4</span><span class="stat-label">enterprise deals stuck in procurement review</span></div>
    </div>
    <div data-chart="0"></div>
  </div>
</div>`,
        css: SAMPLE_SPLIT_CSS,
        charts: [
          {
            type: 'line',
            title: 'ARR by quarter ($M)',
            data: [
              { label: 'Q4 25', value: 5.9 },
              { label: 'Q1 26', value: 6.7 },
              { label: 'Q2 26', value: 6.9 },
              { label: 'Q3 26', value: 8.4 },
            ],
          },
        ],
      },
      {
        title: 'Wins and misses',
        notes:
          'Pair every win with the cost of getting it. The support number is the one the team is proudest of, so credit it by name — Priya shipped the new triage rotation in six weeks. The mobile slip is yours to own, and the honest reason is that you moved the two engineers onto self-serve billing.',
        html: `<div class="slide bullets-slide">
  <header>
    <span class="eyebrow">Scorecard</span>
    <h2>Where we won, and where we slipped.</h2>
  </header>
  <ul class="bullets">
    <li><span class="dot"></span><span class="text"><strong>Won — Self-serve signup</strong> now converts 3.4% of trials, up from 1.9%, after the pricing page rewrite.</span></li>
    <li><span class="dot"></span><span class="text"><strong>Won — First-response time</strong> fell from 9 hours to 42 minutes with the new triage rotation.</span></li>
    <li><span class="dot"></span><span class="text"><strong>Slipped — Enterprise cycle</strong> lengthened from 54 to 78 days; two of those weeks are now security review.</span></li>
    <li><span class="dot"></span><span class="text"><strong>Slipped — Mobile app</strong> moved to Q4 so two engineers could ship usage-based billing.</span></li>
  </ul>
</div>`,
        css: '.bullets-slide .bullets strong { color: var(--fg); font-weight: 650; }',
      },
      {
        title: 'Customer signal',
        notes:
          'Ten minutes is not a metaphor: Meridian sent the renewal email 14 minutes after the call ended, and that email is in the appendix if anyone wants it. She has agreed to be a reference call for the two enterprise deals in procurement, so offer that now rather than at the end.',
        html: `<div class="slide quote-slide">
  <span class="quote-mark">&ldquo;</span>
  <blockquote>We replaced three tools with Northwind and our renewal conversation took ten minutes.</blockquote>
  <footer><span class="rule"></span><div class="sample-who"><strong>Priya Raman</strong><span>VP Operations · Meridian Health</span></div></footer>
</div>`,
        css: SAMPLE_WHO_CSS,
      },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    title: 'Week one · Platform team',
    theme: {
      name: 'Orchid',
      primary: '#8b5cf6',
      accent: '#ffd166',
      background: '#191026',
    },
    slides: [
      {
        title: 'Your first week, mapped out.',
        notes:
          'Set the expectation that nobody ships alone in week one — the point of the week is a real deploy with a real reviewer, not a tour of every repository. Say the buddy\'s name out loud and point at them; the single worst outcome of a first week is a new hire deciding which question is too small to ask.',
        html: `<div class="slide title-slide">
  <span class="eyebrow">New engineers · Platform team</span>
  <h1>Your first week,<br />mapped out.</h1>
  <p class="lede">Three days to your first deploy, one buddy who answers everything, and a checklist nobody expects you to finish alone.</p>
  <div class="sample-tags"><span class="pill accent">First deploy by Thursday</span><span class="pill">Buddy: Sam Okafor</span><span class="pill">No ticket queue in week one</span></div>
</div>`,
        css: SAMPLE_TAGS_CSS,
      },
      {
        title: 'Three days to your first deploy',
        notes:
          'Read the three steps as one arc: read the map, change something tiny, ship it yourself. The deploy on Thursday is the milestone that matters — everything before it exists so that the deploy is boring. Make it explicit that a rolled-back deploy still counts as a successful first week.',
        html: `<div class="slide steps-slide">
  <header>
    <span class="eyebrow">The plan</span>
    <h2>Three days to your first deploy.</h2>
  </header>
  <ol class="steps">
    <li><span class="step-num">1</span><div class="step-body"><h3>Read the map</h3><p>Forty minutes with the architecture page, then a walkthrough of the one service you will touch.</p></div></li>
    <li><span class="step-num">2</span><div class="step-body"><h3>Ship something small</h3><p>A docs fix and a health-check log line, reviewed by your buddy the same afternoon.</p></div></li>
    <li><span class="step-num">3</span><div class="step-body"><h3>Deploy it yourself</h3><p>You run the deploy; the pipeline does the rest. If it rolls back, that still counts.</p></div></li>
  </ol>
  <div class="callout"><span class="callout-label">First-week goal</span>You should be able to explain what happens between a request and a database query.</div>
</div>`,
        css: '.steps-slide .callout { margin-top: auto; font-size: 20px; }',
      },
      {
        title: 'Who to ask for what',
        notes:
          'Name three people, not a channel: "ask in #platform-help" is how questions die. Ines is the shortcut for product context and Marco owns every access request, so a new hire with an AWS permission problem knows the exact person before they are ever blocked.',
        html: `<div class="slide feature-cards-slide">
  <header>
    <span class="eyebrow">People</span>
    <h2>Who to ask for what.</h2>
  </header>
  <div class="card-grid cols-3">
    <div class="card"><h3>Sam Okafor</h3><p>Your buddy. Code review, deploy nerves, and anything you would feel silly asking in a channel.</p></div>
    <div class="card"><h3>Ines Park</h3><p>Product context. Why the roadmap looks the way it does, and which customers to read first.</p></div>
    <div class="card"><h3>Marco Silva</h3><p>Access, CI and anything AWS-shaped. Ask on day one; the wait is usually a permission, not people.</p></div>
  </div>
</div>`,
        css: '.feature-cards-slide .card-grid { margin-top: 8px; } .feature-cards-slide .card h3 { font-size: 24px; }',
      },
      {
        title: 'Read these before Friday',
        notes:
          'Four links, forty minutes total, and say which one matters most: the runbook is the only one you will be expected to use while on call, and it is written for someone who has never seen the system. Nothing here is a prerequisite for shipping on Thursday.',
        html: `<div class="slide bullets-slide">
  <header>
    <span class="eyebrow">Bookmarks</span>
    <h2>Read these before Friday.</h2>
  </header>
  <ul class="bullets">
    <li><span class="dot"></span><span class="text"><strong>Architecture map</strong> — the four services, what each one owns, and what happens when one is slow.</span></li>
    <li><span class="dot"></span><span class="text"><strong>On-call runbook</strong> — written for someone who has never seen the system, because that was you yesterday.</span></li>
    <li><span class="dot"></span><span class="text"><strong>Incident template</strong> — copy it, fill it in while it is happening, not after.</span></li>
    <li><span class="dot"></span><span class="text"><strong>Code review guide</strong> — what we look for, and what we deliberately do not.</span></li>
  </ul>
</div>`,
        css: '.bullets-slide .bullets strong { color: var(--fg); font-weight: 650; }',
      },
    ],
  },
]

/**
 * Scales the canonical 1280x720 canvas into whatever width it lands in, the
 * same way the viewer rail does. Kept local so the sign-in screen doesn't
 * depend on SlideViewer's stylesheet being loaded.
 */
function SlideCanvas({ deck, index }) {
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
          slide={deck.slides[index]}
          theme={deck.theme}
          index={index}
          total={deck.slides.length}
          deckTitle={deck.title}
        />
      </div>
    </div>
  )
}

/**
 * Inline card for the landing and sign-in screens: one live slide per deck,
 * auto-advancing slowly, with dots for jumping around. Clicking opens the
 * full deck at the one currently on screen.
 */
export function SampleDeckCard({ onOpen }) {
  // Deck and slide move together, so the timer can advance from the last slide
  // of one deck into the first slide of the next in a single pure update.
  const [pos, setPos] = useState({ deck: 0, slide: 0 })
  const paused = useRef(false)
  const deck = SAMPLE_DECKS[pos.deck] || SAMPLE_DECKS[0]
  const slideCount = deck.slides.length

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined
    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return
      setPos((p) => {
        const current = SAMPLE_DECKS[p.deck]
        // Last slide of a deck hands over to the next deck: the card is a
        // signed-out visitor's only hint that there is more than one.
        if (p.slide + 1 < current.slides.length) {
          return { deck: p.deck, slide: p.slide + 1 }
        }
        return { deck: (p.deck + 1) % SAMPLE_DECKS.length, slide: 0 }
      })
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
        <SlideCanvas deck={deck} index={pos.slide} />
        <span className="sample-card-badge" aria-hidden>
          <span className="sample-card-play">▶</span> Preview deck
        </span>
        <button
          type="button"
          className="sample-card-hit"
          onClick={() => onOpen?.(pos.deck)}
          aria-label={`Preview the sample deck: ${deck.title}`}
        />
      </div>

      <div className="sample-card-meta">
        <span className="sample-card-title">{deck.title}</span>
        <span className="sample-card-count">
          {pos.slide + 1} / {slideCount}
        </span>
      </div>

      <div className="sample-card-dots">
        {deck.slides.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            className={`sample-dot ${i === pos.slide ? 'is-on' : ''}`}
            aria-label={`Show slide ${i + 1} of ${slideCount}`}
            aria-current={i === pos.slide}
            onClick={() => setPos({ deck: pos.deck, slide: i })}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Full-screen, keyboard-navigable view of the sample decks. The speaker notes
 * are the part of the product a screenshot can never show, so they are one
 * button away instead of being described in a feature list.
 */
export function SampleDeckViewer({ onClose, onSignIn, initialDeck = 0 }) {
  const [deckIndex, setDeckIndex] = useState(() => {
    const i = Number(initialDeck) || 0
    return i >= 0 && i < SAMPLE_DECKS.length ? i : 0
  })
  const [index, setIndex] = useState(0)
  const [notesOpen, setNotesOpen] = useState(false)
  const closeRef = useRef(null)
  const deck = SAMPLE_DECKS[deckIndex]
  const slideCount = deck.slides.length
  const slide = deck.slides[index]

  const go = (delta) =>
    setIndex((i) => Math.min(slideCount - 1, Math.max(0, i + delta)))

  function chooseDeck(i) {
    if (i === deckIndex) return
    setDeckIndex(i)
    setIndex(0)
  }

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
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setNotesOpen((v) => !v)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, slideCount])

  return (
    <div
      className={`sample-viewer ${notesOpen ? 'has-notes' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Sample deck"
    >
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

      <div className="sample-viewer-decks" role="tablist" aria-label="Example decks">
        {SAMPLE_DECKS.map((option, i) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={i === deckIndex}
            className={`sample-deck-tab ${i === deckIndex ? 'is-on' : ''}`}
            onClick={() => chooseDeck(i)}
            title={option.title}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="sample-viewer-stage">
        <div className="sample-viewer-canvas">
          <SlideCanvas deck={deck} index={index} />
        </div>
      </div>

      {notesOpen ? (
        <div className="sample-notes" id="sample-notes" role="region" aria-label="Speaker notes">
          <div className="sample-notes-head">
            <span className="sample-notes-label">Speaker notes</span>
            <span className="sample-notes-slide">Slide {index + 1}</span>
          </div>
          <p className="sample-notes-text">{slide.notes}</p>
        </div>
      ) : null}

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
            {index + 1} / {slideCount}
          </span>
          <button
            type="button"
            className="sample-nav"
            onClick={() => go(1)}
            disabled={index === slideCount - 1}
            aria-label="Next slide"
          >
            ›
          </button>
          <button
            type="button"
            className={`sample-notes-btn ${notesOpen ? 'is-on' : ''}`}
            onClick={() => setNotesOpen((v) => !v)}
            aria-pressed={notesOpen}
            aria-expanded={notesOpen}
            aria-controls="sample-notes"
            title="Toggle speaker notes (N)"
          >
            {notesOpen ? 'Hide notes' : 'Notes'}
          </button>
        </div>

        <p className="sample-viewer-note">
          Generated from a single prompt — layout, copy, chart and speaker notes included.
        </p>

        <button type="button" className="sample-viewer-cta" onClick={onSignIn}>
          Create your own — free
        </button>
      </div>
    </div>
  )
}
