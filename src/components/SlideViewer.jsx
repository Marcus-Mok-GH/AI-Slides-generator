import { useEffect, useRef, useState } from 'react'
import SlideEditor from './SlideEditor.jsx'
import './SlideViewer.css'

function Slide({ slide, theme, index, total }) {
  const isTitle = slide.layout === 'title' || index === 0
  const style = {
    '--slide-bg': theme.background,
    '--slide-primary': theme.primary,
    '--slide-accent': theme.accent,
  }

  return (
    <div className={`slide layout-${slide.layout}`} style={style}>
      <div className="slide-grain" aria-hidden />
      <div className="slide-glow" aria-hidden />

      <div className="slide-body-wrap">
        {isTitle ? (
          <div className="slide-title-block">
            <div className="slide-eyebrow">{theme.name}</div>
            <h1 className="slide-h1">{slide.title}</h1>
            {slide.body ? <p className="slide-lead">{slide.body}</p> : null}
          </div>
        ) : (
          <>
            <h2 className="slide-h2">{slide.title}</h2>

            {slide.layout === 'two-column' ? (
              <div className="cols">
                {slide.body ? <p className="slide-prose">{slide.body}</p> : null}
                {slide.bullets?.length ? (
                  <ul className="slide-bullets">
                    {slide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : slide.layout === 'bullets' ? (
              <ul className="slide-bullets big">
                {(slide.bullets || []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : slide.layout === 'stats' ? (
              <div className="stats">
                {(slide.stats || []).map((s, i) => (
                  <div key={i} className="stat">
                    <div className="stat-value">{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : slide.layout === 'quote' && slide.quote ? (
              <blockquote className="quote">
                <p>“{slide.quote.text}”</p>
                {slide.quote.attribution ? (
                  <footer>— {slide.quote.attribution}</footer>
                ) : null}
              </blockquote>
            ) : (
              <>
                {slide.body ? <p className="slide-prose">{slide.body}</p> : null}
                {slide.bullets?.length ? (
                  <ul className="slide-bullets">
                    {slide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </>
        )}
      </div>

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
    <div className="slide layout-title generating" style={style}>
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
  const [editing, setEditing] = useState(true)
  const userNavigatedRef = useRef(false)
  const prevSlideCountRef = useRef(deck.slides.length)

  const isStreaming = !!deck.streaming
  const slideCount = deck.slides.length
  const expectedCount = deck.expectedCount || slideCount

  // Auto-advance to the newest slide as it streams in (unless the user has
  // taken control by clicking a thumbnail / pressing arrows).
  useEffect(() => {
    const prev = prevSlideCountRef.current
    if (slideCount > prev) {
      if (isStreaming && !userNavigatedRef.current) {
        setActive(slideCount - 1)
      }
    }
    if (!isStreaming) {
      // Reset to slide 1 when streaming finishes, if user hasn't scrubbed.
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

  // Status text in top bar
  let statusText = ''
  if (isStreaming) {
    statusText = `Generating ${slideCount}/${expectedCount}…`
  } else if (savingState === 'saving') {
    statusText = 'Saving…'
  } else if (savingState === 'saved') {
    statusText = 'Saved'
  } else if (savingState === 'error') {
    statusText = 'Save failed'
  }

  // Build the thumbnail list, including placeholder slots while streaming.
  const thumbItems = []
  for (let i = 0; i < Math.max(slideCount, isStreaming ? expectedCount : 0); i++) {
    thumbItems.push(deck.slides[i] || null)
  }

  const showGenerating = !slide

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button className="vbar-btn" onClick={onBack}>← Back to create</button>
        <div className="vbar-title">
          <span className="vbar-deck">{deck.title}</span>
          <span className="vbar-meta">
            · {slideCount}{isStreaming ? `/${expectedCount}` : ''} slides ·{' '}
            {deck.theme?.name || 'Aurora'} theme · {deck.meta?.model}
          </span>
          {statusText ? (
            <span className={`vbar-status ${isStreaming ? 'is-streaming' : ''}`}>
              {isStreaming ? <span className="dot-pulse" /> : null}
              {statusText}
            </span>
          ) : null}
        </div>
        <div className="vbar-actions">
          <button
            className={`vbar-btn ${editing ? 'primary' : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={isStreaming}
            title={isStreaming ? 'Editing unlocks when generation completes' : ''}
          >
            {editing ? '✓ Editing' : '✎ Edit'}
          </button>
          <button className="vbar-btn ghost" disabled={isStreaming}>Share</button>
          <button className="vbar-btn" disabled={isStreaming}>Export</button>
        </div>
      </header>

      <div className={`viewer-body ${editing && !isStreaming ? 'with-editor' : ''}`}>
        <aside className="viewer-side">
          <div className="side-title">Slides</div>
          <ol className="thumb-list">
            {thumbItems.map((s, i) => (
              <li
                key={i}
                className={`thumb ${i === active ? 'is-active' : ''} ${s ? '' : 'is-pending'}`}
                onClick={() => s && userJump(i)}
              >
                <div className="thumb-num">{i + 1}</div>
                <div className="thumb-text">
                  {s ? (
                    <>
                      <div className="thumb-title">{s.title}</div>
                      <div className="thumb-layout">{s.layout}</div>
                    </>
                  ) : (
                    <>
                      <div className="thumb-title shimmer-line" />
                      <div className="thumb-layout shimmer-line short" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <main className="stage">
          <div className="stage-frame">
            {showGenerating ? (
              <GeneratingSlide
                theme={deck.theme || {}}
                expectedCount={expectedCount}
                slidesSoFar={slideCount}
              />
            ) : (
              <Slide
                slide={slide}
                theme={deck.theme}
                index={active}
                total={Math.max(slideCount, expectedCount)}
              />
            )}
          </div>

          <div className="stage-controls">
            <button
              className="stage-btn"
              onClick={() => userJump(Math.max(active - 1, 0))}
              disabled={active === 0 || slideCount === 0}
            >
              ←
            </button>
            <span className="stage-counter">
              {slideCount === 0
                ? 'Drafting…'
                : `Slide ${active + 1} of ${slideCount}${isStreaming ? ` of ${expectedCount}` : ''}`}
            </span>
            <button
              className="stage-btn"
              onClick={() => userJump(Math.min(active + 1, slideCount - 1))}
              disabled={slideCount === 0 || active >= slideCount - 1}
            >
              →
            </button>
          </div>

          {slide?.speakerNotes ? (
            <div className="notes">
              <span className="notes-label">Speaker notes</span>
              <p>{slide.speakerNotes}</p>
            </div>
          ) : null}
        </main>

        {editing && !isStreaming && slide && (
          <SlideEditor
            deck={deck}
            slideIndex={active}
            onChangeSlide={updateSlide}
          />
        )}
      </div>
    </div>
  )
}
