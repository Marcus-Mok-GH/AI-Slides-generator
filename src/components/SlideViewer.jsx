import { useEffect, useRef, useState } from 'react'
import SlideEditor from './SlideEditor.jsx'
import './SlideViewer.css'

/* ----------------------------------------------------------------
   Helpers — image rendering varies a lot by layout. Each slide can
   carry a generated image (slide.image.url). Some layouts use it as
   a full-bleed background; others as a side panel.
   ---------------------------------------------------------------- */

function HeroBackground({ image }) {
  if (!image?.url) return null
  return (
    <div className="slide-bg-image" aria-hidden>
      <img src={image.url} alt="" />
      <div className="slide-bg-tint" />
    </div>
  )
}

function SidePanelImage({ image }) {
  if (!image?.url) return null
  return (
    <div className="slide-side-image" aria-hidden>
      <img src={image.url} alt="" />
    </div>
  )
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
      <HeroBackground image={slide.image} />
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
      <HeroBackground image={slide.image} />
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
      <HeroBackground image={slide.image} />
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
    <div className={`split ${hasImg ? 'has-image' : ''}`}>
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
      {hasImg && <SidePanelImage image={slide.image} />}
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
    <div className={`split ${hasImg ? 'has-image' : ''}`}>
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
      {hasImg && <SidePanelImage image={slide.image} />}
    </div>
  )
}

function QuoteSlide({ slide }) {
  const q = slide.quote || { text: '', attribution: '' }
  const hasImg = !!slide.image?.url
  const typingOn = activeTypingField(slide)
  return (
    <div className={`split ${hasImg ? 'has-image' : ''}`}>
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
      {hasImg && <SidePanelImage image={slide.image} />}
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
    <div className={`split ${hasImg ? 'has-image' : ''}`}>
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
      {hasImg && <SidePanelImage image={slide.image} />}
    </div>
  )
}

function Slide({ slide, theme, index, total }) {
  const isHero = slide.layout === 'title' || index === 0
  const isSection = slide.layout === 'section'
  const isStatement = slide.layout === 'statement'

  const style = {
    '--slide-bg': theme.background,
    '--slide-primary': theme.primary,
    '--slide-accent': theme.accent,
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

function GeneratingSlide({ theme, expectedCount, slidesSoFar }) {
  const style = {
    '--slide-bg': theme.background,
    '--slide-primary': theme.primary,
    '--slide-accent': theme.accent,
  }
  return (
    <div className="slide layout-title is-hero generating" style={style}>
      <div className="slide-grain" aria-hidden />
      <div className="slide-glow" aria-hidden />
      <div className="slide-body-wrap">
        <div className="slide-title-block">
          <div className="slide-eyebrow">
            <span className="dot-pulse" /> Drafting
          </div>
          <h1 className="slide-h1 shimmer">
            {slidesSoFar > 0
              ? `Slide ${slidesSoFar + 1} of ${expectedCount}…`
              : 'Sketching the deck…'}
          </h1>
          <p className="slide-lead">
            Your AI co-designer is composing each card. Slides appear here as
            soon as they're ready.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SlideViewer({ deck, savingState, onDeckChange, onBack }) {
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [toast, setToast] = useState('')
  const userNavigatedRef = useRef(false)
  const prevSlideCountRef = useRef(deck.slides.length)

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2400)
  }

  async function handleShare() {
    if (isStreaming) return
    const link =
      deck.id && typeof window !== 'undefined'
        ? `${window.location.origin}/slide/${encodeURIComponent(deck.id)}`
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

  function handleExport() {
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
    const safeName =
      (deck.title || 'deck')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'deck'
    a.href = url
    a.download = `${safeName}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`Exported ${safeName}.json`)
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
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, slideCount, onBack])

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
          <button
            type="button"
            className="vbar-btn vbar-only-wide"
            disabled={isStreaming}
            onClick={handleExport}
            title={isStreaming ? 'Available when generation completes' : 'Download deck as JSON'}
          >
            Export
          </button>
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

        <main className="stage">
          {showGenerating ? (
            <GeneratingSlide
              theme={deck.theme || {}}
              expectedCount={expectedCount}
              slidesSoFar={slideCount}
            />
          ) : (
            <div className="stage-frame">
              <Slide
                slide={slide}
                theme={deck.theme}
                index={active}
                total={Math.max(slideCount, expectedCount)}
              />
            </div>
          )}

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

          {!showNotes && (
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
    </div>
  )
}
