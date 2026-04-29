import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import SlideEditor from './SlideEditor.jsx'
import HtmlSlide from './HtmlSlide.jsx'
import { exportDeckToPdf, exportDeckToPptx } from '../lib/exportDeck.js'
import './SlideViewer.css'

/* ----------------------------------------------------------------
   Slide canonical canvas. Every slide is laid out as if it lived on
   a fixed 1280×720 (16:9) page — the standard ratio used by modern
   slide tools — and we scale that page to fit whatever stage area
   is available. This keeps proportions, font sizes, and spacing
   identical across small previews, fullscreen, and exports.
   ---------------------------------------------------------------- */
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

/**
 * Observes a stage container and returns the largest scale factor at
 * which a SLIDE_WIDTH × SLIDE_HEIGHT slide will still fit. Returns 0
 * until the container has been measured to avoid flashing a 1× slide
 * before the first measurement.
 */
function useFitScale(containerRef) {
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const s = Math.min(r.width / SLIDE_WIDTH, r.height / SLIDE_HEIGHT)
      setScale(s > 0 ? s : 0)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])
  return scale
}

/* ----------------------------------------------------------------
   Helpers — image rendering varies a lot by layout. Each slide can
   carry a generated image (slide.image.url). Some layouts use it as
   a full-bleed background; others as a side panel.
   ---------------------------------------------------------------- */

function HeroBackground({ image, status }) {
  if (image?.url) {
    return (
      <div className="slide-bg-image" aria-hidden>
        <img src={image.url} alt="" />
        <div className="slide-bg-tint" />
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div className="slide-bg-image is-loading" aria-hidden>
        <div className="img-shimmer" />
        <div className="slide-bg-tint" />
      </div>
    )
  }
  return null
}

function SidePanelImage({ image, status }) {
  if (image?.url) {
    return (
      <div className="slide-side-image" aria-hidden>
        <img src={image.url} alt="" />
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div className="slide-side-image is-loading" aria-hidden>
        <div className="img-shimmer" />
        <div className="img-shimmer-label">Generating image…</div>
      </div>
    )
  }
  return null
}

/**
 * Renders inline text plus a blinking caret when `caret` is true. Used to
 * give the currently-streaming text field a "still typing" indicator.
 */
function TypingText({ text, caret }) {
  return (
    <>
      {text}
      {caret ? <span className="typing-caret" aria-hidden>▌</span> : null}
    </>
  )
}

/**
 * For a partial slide, decide which field is currently being written so we
 * only show ONE caret at a time (on the last non-empty field). The model
 * writes title → body → bullets, so the caret rides whichever is newest.
 */
function activeTypingField(slide) {
  if (!slide?.partial) return null
  if (slide.bullets?.length) return 'bullets'
  if (slide.body) return 'body'
  return 'title'
}

function TitleSlide({ slide, theme }) {
  const typingOn = activeTypingField(slide)
  return (
    <>
      <HeroBackground image={slide.image} status={slide.imageStatus} />
      <div className="slide-title-block">
        <div className="slide-eyebrow">{theme.name || 'Deck'}</div>
        <h1 className="slide-h1">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h1>
        {slide.body ? (
          <p className="slide-lead">
            <TypingText text={slide.body} caret={typingOn === 'body'} />
          </p>
        ) : null}
      </div>
    </>
  )
}

function SectionSlide({ slide }) {
  const typingOn = activeTypingField(slide)
  return (
    <>
      <HeroBackground image={slide.image} status={slide.imageStatus} />
      <div className="slide-section">
        <div className="slide-section-rule" aria-hidden />
        <div className="slide-section-eyebrow">
          {slide.sectionLabel || 'Section'}
        </div>
        <h2 className="slide-section-title">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h2>
      </div>
    </>
  )
}

function StatementSlide({ slide }) {
  const typingOn = activeTypingField(slide)
  return (
    <>
      <HeroBackground image={slide.image} status={slide.imageStatus} />
      <div className="slide-statement">
        <div className="statement-quote-mark" aria-hidden>“</div>
        <h2 className="statement-text">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h2>
        {slide.body ? (
          <p className="statement-sub">
            <TypingText text={slide.body} caret={typingOn === 'body'} />
          </p>
        ) : null}
      </div>
    </>
  )
}

function BulletsSlide({ slide }) {
  const items = slide.bullets || []
  const hasImg = !!slide.image?.url
  const typingOn = activeTypingField(slide)
  const lastIdx = items.length - 1
  return (
    <div className={`split ${hasImg || slide.imageStatus === 'pending' ? 'has-image' : ''}`}>
      <div className="split-text">
        <h2 className="slide-h2">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h2>
        <ul className="bullets-grid">
          {items.map((b, i) => (
            <li key={i} className="bullet-card">
              <span className="bullet-dot" aria-hidden />
              <span className="bullet-text">
                <TypingText
                  text={b}
                  caret={typingOn === 'bullets' && i === lastIdx}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
      {(hasImg || slide.imageStatus === 'pending') && (
        <SidePanelImage image={slide.image} status={slide.imageStatus} />
      )}
    </div>
  )
}

function StepsSlide({ slide }) {
  const steps = (slide.steps || []).filter(
    (s) => s && (s.label || s.detail),
  )
  const typingOn = activeTypingField(slide)
  return (
    <>
      <h2 className="slide-h2">
        <TypingText text={slide.title} caret={typingOn === 'title'} />
      </h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className="step">
            <div className="step-num">{i + 1}</div>
            <div className="step-meta">
              <div className="step-label">{s.label}</div>
              {s.detail ? <div className="step-detail">{s.detail}</div> : null}
            </div>
            {i < steps.length - 1 && (
              <div className="step-arrow" aria-hidden>→</div>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function ComparisonSlide({ slide }) {
  const cmp = slide.comparison || {
    leftLabel: '',
    leftItems: [],
    rightLabel: '',
    rightItems: [],
  }
  const typingOn = activeTypingField(slide)
  return (
    <>
      <h2 className="slide-h2">
        <TypingText text={slide.title} caret={typingOn === 'title'} />
      </h2>
      <div className="cmp">
        <div className="cmp-col cmp-left">
          <div className="cmp-label">{cmp.leftLabel || 'Before'}</div>
          <ul className="cmp-list">
            {(cmp.leftItems || []).map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
        <div className="cmp-divider" aria-hidden>
          <span>vs</span>
        </div>
        <div className="cmp-col cmp-right">
          <div className="cmp-label">{cmp.rightLabel || 'After'}</div>
          <ul className="cmp-list">
            {(cmp.rightItems || []).map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function StatsSlide({ slide }) {
  const hasImg = !!slide.image?.url
  const typingOn = activeTypingField(slide)
  return (
    <div className={`split ${hasImg || slide.imageStatus === 'pending' ? 'has-image' : ''}`}>
      <div className="split-text">
        <h2 className="slide-h2">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h2>
        <div className="stats">
          {(slide.stats || []).map((s, i) => (
            <div key={i} className="stat">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      {(hasImg || slide.imageStatus === 'pending') && (
        <SidePanelImage image={slide.image} status={slide.imageStatus} />
      )}
    </div>
  )
}

function QuoteSlide({ slide }) {
  const q = slide.quote || { text: '', attribution: '' }
  const hasImg = !!slide.image?.url
  const typingOn = activeTypingField(slide)
  return (
    <div className={`split ${hasImg || slide.imageStatus === 'pending' ? 'has-image' : ''}`}>
      <div className="split-text">
        {slide.title ? (
          <div className="quote-eyebrow">
            <TypingText text={slide.title} caret={typingOn === 'title'} />
          </div>
        ) : null}
        <blockquote className="quote">
          <p>“{q.text}”</p>
          {q.attribution ? <footer>— {q.attribution}</footer> : null}
        </blockquote>
      </div>
      {(hasImg || slide.imageStatus === 'pending') && (
        <SidePanelImage image={slide.image} status={slide.imageStatus} />
      )}
    </div>
  )
}

function TwoColumnSlide({ slide }) {
  const typingOn = activeTypingField(slide)
  const lastIdx = (slide.bullets?.length || 0) - 1
  return (
    <>
      <h2 className="slide-h2">
        <TypingText text={slide.title} caret={typingOn === 'title'} />
      </h2>
      <div className="cols">
        {slide.body ? (
          <p className="slide-prose">
            <TypingText text={slide.body} caret={typingOn === 'body'} />
          </p>
        ) : null}
        {slide.bullets?.length ? (
          <ul className="bullets-grid compact">
            {slide.bullets.map((b, i) => (
              <li key={i} className="bullet-card">
                <span className="bullet-dot" aria-hidden />
                <span className="bullet-text">
                  <TypingText
                    text={b}
                    caret={typingOn === 'bullets' && i === lastIdx}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  )
}

function ContentSlide({ slide }) {
  const hasImg = !!slide.image?.url
  const typingOn = activeTypingField(slide)
  return (
    <div className={`split ${hasImg || slide.imageStatus === 'pending' ? 'has-image' : ''}`}>
      <div className="split-text">
        <h2 className="slide-h2">
          <TypingText text={slide.title} caret={typingOn === 'title'} />
        </h2>
        {slide.body ? (
          <p className="slide-prose lead">
            <TypingText text={slide.body} caret={typingOn === 'body'} />
          </p>
        ) : null}
      </div>
      {(hasImg || slide.imageStatus === 'pending') && (
        <SidePanelImage image={slide.image} status={slide.imageStatus} />
      )}
    </div>
  )
}

function Slide({ slide, theme, index, total, deckTitle }) {
  const isHero = slide.layout === 'title' || index === 0
  const isSection = slide.layout === 'section'
  const isStatement = slide.layout === 'statement'

  const style = {
    '--slide-bg': theme.background,
    '--slide-primary': theme.primary,
    '--slide-accent': theme.accent,
  }

  // Prefer the AI-generated HTML/CSS layout when present (and the slide is
  // not still being streamed). Falls back to the structured-layout renderer
  // if html is missing — that path also runs while the slide is partial so
  // the user sees text growing in instead of an empty frame.
  // The HtmlSlide iframe paints its own page footer (slide # / total · deck
  // title) so we don't add a duplicate outer footer here.
  if (slide.html && !slide.partial) {
    return (
      <div
        className={`slide html-slide ${slide.partial ? 'is-typing' : ''}`}
        style={style}
      >
        <HtmlSlide
          slide={slide}
          theme={theme}
          index={index}
          total={total}
          deckTitle={deckTitle}
        />
      </div>
    )
  }

  let body = null
  switch (slide.layout) {
    case 'title':
      body = <TitleSlide slide={slide} theme={theme} />
      break
    case 'section':
      body = <SectionSlide slide={slide} />
      break
    case 'statement':
      body = <StatementSlide slide={slide} />
      break
    case 'bullets':
      body = <BulletsSlide slide={slide} />
      break
    case 'steps':
    // Process flows render the same as steps in the streaming preview.
    // Once the final HTML arrives, HtmlSlide paints the richer Gamma look.
    // eslint-disable-next-line no-fallthrough
    case 'process-flow':
      body = <StepsSlide slide={slide} />
      break
    case 'timeline':
      body = <StepsSlide slide={slide} />
      break
    case 'comparison':
      body = <ComparisonSlide slide={slide} />
      break
    case 'stats':
      body = <StatsSlide slide={slide} />
      break
    case 'quote':
      body = <QuoteSlide slide={slide} />
      break
    case 'two-column':
      body = <TwoColumnSlide slide={slide} />
      break
    case 'feature-cards':
      // Streaming preview falls back to bullets; final HTML paints the cards.
      body = <BulletsSlide slide={slide} />
      break
    case 'callout':
      body = <StatementSlide slide={slide} />
      break
    case 'content':
      body = <ContentSlide slide={slide} />
      break
    default:
      body = isHero ? (
        <TitleSlide slide={slide} theme={theme} />
      ) : (
        <ContentSlide slide={slide} />
      )
  }

  const hasFullBleed =
    (isHero || isSection || isStatement) && !!slide.image?.url

  return (
    <div
      className={`slide layout-${slide.layout} ${
        isHero ? 'is-hero' : ''
      } ${isSection ? 'is-section' : ''} ${
        isStatement ? 'is-statement' : ''
      } ${hasFullBleed ? 'has-bg-image' : ''} ${
        slide.partial ? 'is-typing' : ''
      }`}
      style={style}
    >
      <div className="slide-grain" aria-hidden />
      {!hasFullBleed && <div className="slide-glow" aria-hidden />}
      {!hasFullBleed && isSection ? (
        <div className="slide-glow alt" aria-hidden />
      ) : null}

      <div className="slide-body-wrap">{body}</div>

      <div className="slide-footer">
        <span>{index + 1} / {total}</span>
      </div>
    </div>
  )
}

function ThinkingPanel({ theme, expectedCount, slidesSoFar, prompt, deckTitle, thinkingText }) {
  const streamRef = useRef(null)

  // Auto-scroll the reasoning stream to the bottom as new tokens arrive
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [thinkingText])

  // Soft tinted glow that picks up the deck's theme without imitating a slide.
  const style = {
    '--think-primary': theme?.primary || '#7c5cff',
    '--think-accent': theme?.accent || '#ff6ea0',
  }

  // 3-stage rough mapping that feels accurate without being noisy.
  // 0 → outlining, 1 → drafting slides, 2 → composing visuals.
  let stageIndex = 0
  if (slidesSoFar > 0 && slidesSoFar < expectedCount) stageIndex = 1
  else if (slidesSoFar >= expectedCount && expectedCount > 0) stageIndex = 2

  const stages = [
    { key: 'outline', label: 'Sketching outline' },
    { key: 'draft', label: 'Drafting slides' },
    { key: 'visuals', label: 'Composing visuals' },
  ]

  const headline =
    stageIndex === 0
      ? 'Thinking through your deck…'
      : stageIndex === 1
        ? `Drafting slide ${Math.min(slidesSoFar + 1, expectedCount)} of ${expectedCount}…`
        : 'Polishing visuals…'

  const subhead =
    stageIndex === 0
      ? "Reading your prompt and choosing a structure. Slides will start appearing in a few seconds."
      : stageIndex === 1
        ? "Each card streams in as soon as it's ready — feel free to scroll the side panel."
        : "Adding the last touches before everything settles in."

  const pct = expectedCount
    ? Math.min(100, Math.round((slidesSoFar / Math.max(expectedCount, 1)) * 100))
    : 0

  return (
    <div className="thinking-panel" style={style} role="status" aria-live="polite">
      <div className="thinking-aura" aria-hidden>
        <span className="thinking-aura-blob a" />
        <span className="thinking-aura-blob b" />
      </div>

      <div className="thinking-card">
        <div className="thinking-eyebrow">
          <span className="thinking-orb" aria-hidden>
            <span className="thinking-orb-ring" />
            <span className="thinking-orb-core" />
          </span>
          <span className="thinking-eyebrow-text">AI is thinking</span>
        </div>

        <h1 className="thinking-headline">{headline}</h1>
        <p className="thinking-sub">{subhead}</p>

        {prompt ? (
          <div className="thinking-prompt">
            <span className="thinking-prompt-label">Your prompt</span>
            <p className="thinking-prompt-text">
              {prompt.length > 220 ? prompt.slice(0, 217).trim() + '…' : prompt}
            </p>
          </div>
        ) : null}

        <div className="thinking-progress">
          <div className="thinking-progress-track">
            <div
              className="thinking-progress-fill"
              style={{ width: `${Math.max(pct, 6)}%` }}
            />
          </div>
          <div className="thinking-progress-label">
            {slidesSoFar > 0
              ? `${slidesSoFar} of ${expectedCount} ready`
              : `Preparing ${expectedCount} slides`}
          </div>
        </div>

        <ol className="thinking-stages">
          {stages.map((s, i) => {
            const state =
              i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'todo'
            return (
              <li key={s.key} className={`thinking-stage is-${state}`}>
                <span className="thinking-stage-marker" aria-hidden>
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className="thinking-stage-label">{s.label}</span>
              </li>
            )
          })}
        </ol>

        {deckTitle && deckTitle !== 'Generating…' ? (
          <div className="thinking-deck-title" title={deckTitle}>
            <span className="thinking-deck-title-label">Working title</span>
            <span className="thinking-deck-title-text">{deckTitle}</span>
          </div>
        ) : null}

        {thinkingText ? (
          <div className="thinking-stream">
            <div className="thinking-stream-header">
              <span className="thinking-stream-dot" aria-hidden />
              <span className="thinking-stream-label">Reasoning stream</span>
            </div>
            <div className="thinking-stream-body" ref={streamRef}>
              <pre className="thinking-stream-text">{thinkingText}<span className="thinking-stream-caret">▌</span></pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ============================================================
   Presentation (full-screen) mode
   ============================================================ */

function PresentMode({ slides, theme, active, total, deckTitle, onNext, onPrev, onExit }) {
  const containerRef = useRef(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [dir, setDir] = useState(0) // -1 left, 0 none, 1 right (for animation)
  const slide = slides[active]

  /* Request full-screen on mount, listen for external exit (Esc key native) */
  useEffect(() => {
    const el = containerRef.current
    if (el && document.fullscreenEnabled) {
      el.requestFullscreen().catch(() => {})
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) onExit()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onExit])

  /* Keyboard navigation */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); setDir(1); onNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); setDir(-1); onPrev()
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else onExit()
      } else if (e.key === 'n' || e.key === 'N') {
        setNotesOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onPrev, onExit])

  function handleZoneClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    if (pct < 0.3) { setDir(-1); onPrev() }
    else if (pct > 0.7) { setDir(1); onNext() }
  }

  const pct = total > 1 ? Math.round(((active + 1) / total) * 100) : 100

  return (
    <div className="present-overlay" ref={containerRef}>
      {/* Slide area — clickable for nav */}
      <div className="present-stage" onClick={handleZoneClick}>
        {slide ? (
          <div
            key={active}
            className={`present-slide-wrap present-slide-enter present-slide-enter-${dir === 1 ? 'right' : dir === -1 ? 'left' : 'none'}`}
          >
            <HtmlSlide
              slide={slide}
              theme={theme}
              index={active}
              total={total}
              deckTitle={deckTitle}
            />
          </div>
        ) : null}

        {/* Ghost click-zone hints */}
        {active > 0 && (
          <div className="present-zone-hint left" aria-hidden>
            <span className="present-arrow">‹</span>
          </div>
        )}
        {active < total - 1 && (
          <div className="present-zone-hint right" aria-hidden>
            <span className="present-arrow">›</span>
          </div>
        )}
      </div>

      {/* Bottom HUD */}
      <div className="present-hud">
        <button
          className="present-hud-btn"
          onClick={() => { setDir(-1); onPrev() }}
          disabled={active === 0}
          aria-label="Previous slide"
        >←</button>

        <div className="present-counter">
          <div className="present-progress">
            <div className="present-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="present-counter-text">{active + 1} / {total}</span>
        </div>

        <button
          className="present-hud-btn"
          onClick={() => { setDir(1); onNext() }}
          disabled={active === total - 1}
          aria-label="Next slide"
        >→</button>

        <div className="present-hud-sep" />

        <button
          className={`present-hud-btn ${notesOpen ? 'is-active' : ''}`}
          onClick={() => setNotesOpen(v => !v)}
          title="Toggle speaker notes (N)"
        >Notes</button>

        <button
          className="present-hud-btn present-exit"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
            else onExit()
          }}
          title="Exit presentation (Esc)"
        >✕ Exit</button>
      </div>

      {/* Speaker notes panel */}
      {notesOpen && slide?.speakerNotes && (
        <div className="present-notes">
          <div className="present-notes-label">Speaker notes</div>
          <p className="present-notes-text">{slide.speakerNotes}</p>
        </div>
      )}
    </div>
  )
}

export default function SlideViewer({ deck, savingState, onDeckChange, onBack }) {
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [toast, setToast] = useState('')
  const userNavigatedRef = useRef(false)
  const prevSlideCountRef = useRef(deck.slides.length)
  const stageRef = useRef(null)
  const stageScale = useFitScale(stageRef)

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2400)
  }

  async function handleShare() {
    if (isStreaming) return
    const link =
      deck.id && typeof window !== 'undefined'
        ? `${window.location.origin}/app/slide/${encodeURIComponent(deck.id)}`
        : window.location.href
    const shareData = {
      title: deck.title || 'Deck',
      text: deck.subtitle || `Check out this deck: ${deck.title}`,
      url: link,
    }
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        return
      }
    } catch {
      /* user cancelled — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(link)
      showToast('Share link copied to clipboard')
    } catch {
      window.prompt('Copy this link:', link)
    }
  }

  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState('') // '' | 'pdf' | 'pptx' | 'json'
  const exportMenuRef = useRef(null)

  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e) => {
      if (!exportMenuRef.current?.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportOpen])

  function safeFileName() {
    return (
      (deck.title || 'deck')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'deck'
    )
  }

  function handleExportJson() {
    setExportOpen(false)
    if (isStreaming) return
    const exportable = {
      id: deck.id,
      title: deck.title,
      subtitle: deck.subtitle,
      theme: deck.theme,
      slides: deck.slides,
      meta: deck.meta,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(exportable, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = safeFileName()
    a.href = url
    a.download = `${name}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`Exported ${name}.json`)
  }

  async function handleExportPdf() {
    setExportOpen(false)
    if (isStreaming || exportBusy) return
    setExportBusy('pdf')
    try {
      await exportDeckToPdf(deck, {
        onProgress: ({ index, total }) =>
          showToast(`Rendering slide ${index + 1} of ${total}…`),
      })
      showToast('PDF downloaded')
    } catch (err) {
      console.error('[export pdf]', err)
      showToast('PDF export failed')
    } finally {
      setExportBusy('')
    }
  }

  async function handleExportPptx() {
    setExportOpen(false)
    if (isStreaming || exportBusy) return
    setExportBusy('pptx')
    try {
      await exportDeckToPptx(deck, {
        onProgress: ({ index, total }) =>
          showToast(`Rendering slide ${index + 1} of ${total}…`),
      })
      showToast('PPTX downloaded — open in Google Slides or PowerPoint')
    } catch (err) {
      console.error('[export pptx]', err)
      showToast('PPTX export failed')
    } finally {
      setExportBusy('')
    }
  }

  const isStreaming = !!deck.streaming
  const slideCount = deck.slides.length
  const expectedCount = deck.expectedCount || slideCount

  useEffect(() => {
    const prev = prevSlideCountRef.current
    if (slideCount > prev) {
      if (isStreaming && !userNavigatedRef.current) {
        setActive(slideCount - 1)
      }
    }
    if (!isStreaming) {
      if (!userNavigatedRef.current) setActive(0)
    }
    prevSlideCountRef.current = slideCount
  }, [slideCount, isStreaming])

  const userJump = (i) => {
    userNavigatedRef.current = true
    setActive(i)
  }

  useEffect(() => {
    const handler = (e) => {
      if (presenting) return // PresentMode handles its own keyboard events
      const t = e.target
      const tag = t?.tagName
      const isFormField =
        tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
      if (isFormField) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        userJump(Math.min(active + 1, Math.max(slideCount - 1, 0)))
      } else if (e.key === 'ArrowLeft') {
        userJump(Math.max(active - 1, 0))
      } else if (e.key === 'Escape') {
        onBack?.()
      } else if ((e.key === 'f' || e.key === 'F') && !isFormField) {
        if (slide && !isStreaming) setPresenting(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, slideCount, onBack, presenting])

  const slide = deck.slides[active]

  function updateSlide(updated) {
    const nextSlides = deck.slides.map((s, i) => (i === active ? updated : s))
    onDeckChange?.({ ...deck, slides: nextSlides })
  }

  // Count of slides that are fully complete (not partials).
  const completedCount = deck.slides.reduce(
    (n, s) => n + (s && !s.partial ? 1 : 0),
    0,
  )
  const inProgressIndex =
    isStreaming && completedCount < expectedCount ? completedCount : -1
  const progressPct = isStreaming
    ? Math.min(100, Math.round((completedCount / Math.max(expectedCount, 1)) * 100))
    : 100

  let statusText = ''
  if (isStreaming) {
    statusText =
      completedCount === 0
        ? 'Drafting slide 1…'
        : `Drafting slide ${Math.min(completedCount + 1, expectedCount)} of ${expectedCount}`
  } else if (savingState === 'saving') {
    statusText = 'Saving…'
  } else if (savingState === 'saved') {
    statusText = 'Saved'
  } else if (savingState === 'error') {
    statusText = 'Save failed'
  }

  const thumbItems = []
  for (let i = 0; i < Math.max(slideCount, isStreaming ? expectedCount : 0); i++) {
    thumbItems.push(deck.slides[i] || null)
  }

  const showGenerating = !slide || (slide.partial && !slide.title)
  const hasNotes = !!slide?.speakerNotes

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button
          className="vbar-btn vbar-back"
          onClick={onBack}
          aria-label="Back to create"
        >
          <span className="vbar-back-icon">←</span>
          <span className="vbar-back-label">Back to create</span>
        </button>
        <div className="vbar-title">
          <span className="vbar-deck">{deck.title}</span>
          <span className="vbar-meta">
            · {isStreaming ? `${completedCount}/${expectedCount}` : slideCount} slides ·{' '}
            {deck.theme?.name || 'Aurora'} theme
          </span>
          {statusText ? (
            <span className={`vbar-status ${isStreaming ? 'is-streaming' : ''}`}>
              {isStreaming ? <span className="dot-pulse" /> : null}
              {statusText}
            </span>
          ) : null}
        </div>
        {isStreaming ? (
          <div
            className="vbar-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Deck generation progress"
          >
            <div
              className="vbar-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
        <div className="vbar-actions">
          <button
            className="vbar-btn vbar-present-btn"
            onClick={() => setPresenting(true)}
            disabled={isStreaming || !slide}
            title={isStreaming ? 'Available when generation completes' : 'Present full-screen (F)'}
          >
            <span className="vbar-present-full">▶ Present</span>
            <span className="vbar-present-icon" aria-hidden>▶</span>
          </button>
          <button
            className={`vbar-btn ${editing ? 'primary' : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={isStreaming}
            title={isStreaming ? 'Editing unlocks when generation completes' : ''}
          >
            <span className="vbar-edit-full">{editing ? '✓ Editing' : '✎ Edit'}</span>
            <span className="vbar-edit-mini" aria-hidden>{editing ? '✓' : '✎'}</span>
          </button>
          <button
            type="button"
            className="vbar-btn ghost vbar-only-wide"
            disabled={isStreaming}
            onClick={handleShare}
            title={isStreaming ? 'Available when generation completes' : 'Copy a shareable link'}
          >
            Share
          </button>
          <div className="export-menu-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="vbar-btn"
              disabled={isStreaming || !!exportBusy}
              onClick={() => setExportOpen((v) => !v)}
              title={isStreaming ? 'Available when generation completes' : 'Download deck'}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              {exportBusy === 'pdf'
                ? <><span className="vbar-export-full">Building PDF…</span><span className="vbar-export-icon" aria-hidden>⏳</span></>
                : exportBusy === 'pptx'
                  ? <><span className="vbar-export-full">Building PPTX…</span><span className="vbar-export-icon" aria-hidden>⏳</span></>
                  : <><span className="vbar-export-full">Export ▾</span><span className="vbar-export-icon" aria-hidden>↓</span></>}
            </button>
            {exportOpen && !isStreaming && !exportBusy && (
              <div className="export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportPdf}
                >
                  <span className="emi-title">PDF</span>
                  <span className="emi-sub">Print or share, page-per-slide</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportPptx}
                >
                  <span className="emi-title">PPTX</span>
                  <span className="emi-sub">Open in Google Slides or PowerPoint</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportJson}
                >
                  <span className="emi-title">JSON</span>
                  <span className="emi-sub">Raw deck data</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`viewer-body ${editing && !isStreaming ? 'with-editor' : ''}`}>
        <aside className="viewer-side">
          <div className="side-title">Slides</div>
          <ol className="thumb-list">
            {thumbItems.map((s, i) => {
              const isPartial = s?.partial
              const isInProgress = i === inProgressIndex
              return (
                <li
                  key={i}
                  className={`thumb ${i === active ? 'is-active' : ''} ${
                    s ? '' : 'is-pending'
                  } ${isPartial ? 'is-partial' : ''} ${
                    isInProgress ? 'is-in-progress' : ''
                  }`}
                  onClick={() => s && userJump(i)}
                >
                  <div className="thumb-num">{i + 1}</div>
                  <div className="thumb-text">
                    {s && s.title ? (
                      <>
                        <div className="thumb-title">
                          {s.title}
                          {isPartial ? <span className="caret-blink">▌</span> : null}
                        </div>
                        <div className="thumb-layout">
                          {s.layout || (isPartial ? 'writing…' : '')}
                          {s.image?.url ? ' · img' : ''}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="thumb-title shimmer-line" />
                        <div className="thumb-layout shimmer-line short" />
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* Mobile-only horizontal slide rail */}
        <div className="thumb-strip" role="tablist" aria-label="Slides">
          {thumbItems.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`strip-thumb ${i === active ? 'is-active' : ''} ${s ? '' : 'is-pending'}`}
              onClick={() => s && userJump(i)}
              disabled={!s}
            >
              <span className="strip-num">{i + 1}</span>
              <span className="strip-title">
                {s ? s.title : <span className="shimmer-line" />}
              </span>
            </button>
          ))}
        </div>

        <main className="stage" ref={stageRef}>
          {showGenerating ? (
            <ThinkingPanel
              theme={deck.theme || {}}
              expectedCount={expectedCount}
              slidesSoFar={completedCount}
              prompt={deck.meta?.prompt || ''}
              deckTitle={deck.title}
              thinkingText={deck.thinkingText || ''}
            />
          ) : (
            <div
              className="stage-frame"
              style={{
                width: `${SLIDE_WIDTH}px`,
                height: `${SLIDE_HEIGHT}px`,
                transform: `translate(-50%, -50%) scale(${stageScale || 0.0001})`,
                visibility: stageScale > 0 ? 'visible' : 'hidden',
              }}
            >
              <Slide
                key={active}
                slide={slide}
                theme={deck.theme}
                index={active}
                total={Math.max(slideCount, expectedCount)}
                deckTitle={deck.title}
              />
            </div>
          )}

          {!showGenerating && (
            <>
              <button
                className="stage-nav prev"
                onClick={() => userJump(Math.max(active - 1, 0))}
                disabled={active === 0 || slideCount === 0}
                aria-label="Previous slide"
              >
                ‹
              </button>
              <button
                className="stage-nav next"
                onClick={() => userJump(Math.min(active + 1, slideCount - 1))}
                disabled={slideCount === 0 || active >= slideCount - 1}
                aria-label="Next slide"
              >
                ›
              </button>
            </>
          )}

          {!showNotes && !showGenerating && (
            <div className="stage-counter-pill">
              {slideCount === 0
                ? 'Drafting…'
                : `${active + 1} / ${Math.max(slideCount, expectedCount)}`}
            </div>
          )}

          {hasNotes && !showNotes && (
            <button
              className="notes-toggle"
              onClick={() => setShowNotes(true)}
              title="Show speaker notes"
            >
              <span aria-hidden>☰</span> Notes
            </button>
          )}

          {showNotes && hasNotes && (
            <div className="notes-drawer">
              <div className="notes-drawer-head">
                <span className="notes-drawer-label">Speaker notes</span>
                <button
                  type="button"
                  className="notes-drawer-close"
                  onClick={() => setShowNotes(false)}
                  aria-label="Close notes"
                >
                  ×
                </button>
              </div>
              <p>{slide.speakerNotes}</p>
            </div>
          )}
        </main>

        {editing && !isStreaming && slide && (
          <SlideEditor
            deck={deck}
            slideIndex={active}
            onChangeSlide={updateSlide}
            onClose={() => setEditing(false)}
          />
        )}
        {editing && !isStreaming && slide && (
          <button
            className="editor-backdrop"
            aria-label="Close editor"
            onClick={() => setEditing(false)}
          />
        )}
      </div>

      {toast ? (
        <div className="vbar-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {presenting && !isStreaming && (
        <PresentMode
          slides={deck.slides}
          theme={deck.theme}
          active={active}
          total={slideCount}
          deckTitle={deck.title}
          onNext={() => setActive(i => Math.min(i + 1, slideCount - 1))}
          onPrev={() => setActive(i => Math.max(i - 1, 0))}
          onExit={() => setPresenting(false)}
        />
      )}
    </div>
  )
}
