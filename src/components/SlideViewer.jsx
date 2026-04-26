import { useEffect, useState } from 'react'
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

export default function SlideViewer({ deck, onDeckChange, onBack }) {
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState(true)

  useEffect(() => {
    const handler = (e) => {
      const t = e.target
      const tag = t?.tagName
      const isFormField =
        tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
      if (isFormField) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setActive((i) => Math.min(i + 1, deck.slides.length - 1))
      } else if (e.key === 'ArrowLeft') {
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Escape') {
        onBack?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deck.slides.length, onBack])

  const slide = deck.slides[active]

  function updateSlide(updated) {
    const nextSlides = deck.slides.map((s, i) => (i === active ? updated : s))
    onDeckChange?.({ ...deck, slides: nextSlides })
  }

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button className="vbar-btn" onClick={onBack}>← Back to create</button>
        <div className="vbar-title">
          <span className="vbar-deck">{deck.title}</span>
          <span className="vbar-meta">
            · {deck.slides.length} slides · {deck.theme.name} theme · {deck.meta.model}
          </span>
        </div>
        <div className="vbar-actions">
          <button
            className={`vbar-btn ${editing ? 'primary' : ''}`}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '✓ Editing' : '✎ Edit'}
          </button>
          <button className="vbar-btn ghost">Share</button>
          <button className="vbar-btn">Export</button>
        </div>
      </header>

      <div className={`viewer-body ${editing ? 'with-editor' : ''}`}>
        <aside className="viewer-side">
          <div className="side-title">Slides</div>
          <ol className="thumb-list">
            {deck.slides.map((s, i) => (
              <li
                key={i}
                className={`thumb ${i === active ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
              >
                <div className="thumb-num">{i + 1}</div>
                <div className="thumb-text">
                  <div className="thumb-title">{s.title}</div>
                  <div className="thumb-layout">{s.layout}</div>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <main className="stage">
          <div className="stage-frame">
            <Slide
              slide={slide}
              theme={deck.theme}
              index={active}
              total={deck.slides.length}
            />
          </div>

          <div className="stage-controls">
            <button
              className="stage-btn"
              onClick={() => setActive((i) => Math.max(i - 1, 0))}
              disabled={active === 0}
            >
              ←
            </button>
            <span className="stage-counter">
              Slide {active + 1} of {deck.slides.length}
            </span>
            <button
              className="stage-btn"
              onClick={() =>
                setActive((i) => Math.min(i + 1, deck.slides.length - 1))
              }
              disabled={active === deck.slides.length - 1}
            >
              →
            </button>
          </div>

          {slide.speakerNotes ? (
            <div className="notes">
              <span className="notes-label">Speaker notes</span>
              <p>{slide.speakerNotes}</p>
            </div>
          ) : null}
        </main>

        {editing && (
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
