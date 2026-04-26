import { useState } from 'react'
import { regenerateSlide } from '../lib/api.js'
import './SlideEditor.css'

const LAYOUTS = [
  { id: 'title', label: 'Title', hint: 'Big hero card' },
  { id: 'content', label: 'Content', hint: 'Title + prose' },
  { id: 'two-column', label: 'Two-column', hint: 'Prose + bullets' },
  { id: 'bullets', label: 'Bullets', hint: 'Punchy list' },
  { id: 'quote', label: 'Quote', hint: 'Pull quote' },
  { id: 'stats', label: 'Stats', hint: 'Numbers grid' },
]

function ListEditor({ items, onChange, placeholder, max = 8 }) {
  const update = (i, val) => {
    const next = [...items]
    next[i] = val
    onChange(next)
  }
  const remove = (i) => {
    const next = items.filter((_, idx) => idx !== i)
    onChange(next)
  }
  const add = () => {
    if (items.length >= max) return
    onChange([...items, ''])
  }
  return (
    <div className="list-edit">
      {items.map((item, i) => (
        <div key={i} className="list-row">
          <input
            className="ed-input"
            value={item}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <button
            className="row-x"
            onClick={() => remove(i)}
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}
      {items.length < max && (
        <button className="add-row" onClick={add}>
          + Add item
        </button>
      )}
    </div>
  )
}

function StatsEditor({ stats, onChange }) {
  const update = (i, key, val) => {
    const next = stats.map((s, idx) =>
      idx === i ? { ...s, [key]: val } : s,
    )
    onChange(next)
  }
  const remove = (i) => onChange(stats.filter((_, idx) => idx !== i))
  const add = () => {
    if (stats.length >= 6) return
    onChange([...stats, { label: '', value: '' }])
  }
  return (
    <div className="list-edit">
      {stats.map((s, i) => (
        <div key={i} className="stat-row">
          <input
            className="ed-input value"
            value={s.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            placeholder="100M+"
          />
          <input
            className="ed-input"
            value={s.label}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="Label"
          />
          <button className="row-x" onClick={() => remove(i)} aria-label="Remove">
            ×
          </button>
        </div>
      ))}
      {stats.length < 6 && (
        <button className="add-row" onClick={add}>
          + Add stat
        </button>
      )}
    </div>
  )
}

export default function SlideEditor({ deck, slideIndex, onChangeSlide }) {
  const slide = deck.slides[slideIndex]
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')

  function patch(partial) {
    onChangeSlide({ ...slide, ...partial })
  }

  async function doRegenerate() {
    setRegenerating(true)
    setRegenError('')
    try {
      const newSlide = await regenerateSlide({
        deck,
        slideIndex,
        instruction,
      })
      onChangeSlide(newSlide)
      setInstruction('')
    } catch (e) {
      setRegenError(e.message || 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <aside className="editor">
      <div className="editor-head">
        <span className="editor-eyebrow">Editing slide {slideIndex + 1}</span>
        <h3 className="editor-title">Card properties</h3>
      </div>

      <div className="ed-section">
        <label className="ed-label">Layout</label>
        <div className="layout-grid">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`layout-btn ${slide.layout === l.id ? 'is-on' : ''}`}
              onClick={() => patch({ layout: l.id })}
              title={l.hint}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ed-section">
        <label className="ed-label">Title</label>
        <input
          className="ed-input"
          value={slide.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Slide title"
        />
      </div>

      {(slide.layout === 'title' ||
        slide.layout === 'content' ||
        slide.layout === 'two-column') && (
        <div className="ed-section">
          <label className="ed-label">
            {slide.layout === 'title' ? 'Subtitle' : 'Body'}
          </label>
          <textarea
            className="ed-textarea"
            rows={3}
            value={slide.body}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder={
              slide.layout === 'title'
                ? 'One-sentence subtitle'
                : 'Paragraph of body copy'
            }
          />
        </div>
      )}

      {(slide.layout === 'bullets' ||
        slide.layout === 'two-column' ||
        slide.layout === 'content') && (
        <div className="ed-section">
          <label className="ed-label">Bullets</label>
          <ListEditor
            items={slide.bullets || []}
            onChange={(b) => patch({ bullets: b })}
            placeholder="Short, punchy bullet"
          />
        </div>
      )}

      {slide.layout === 'stats' && (
        <div className="ed-section">
          <label className="ed-label">Stats</label>
          <StatsEditor
            stats={slide.stats || []}
            onChange={(s) => patch({ stats: s })}
          />
        </div>
      )}

      {slide.layout === 'quote' && (
        <div className="ed-section">
          <label className="ed-label">Quote</label>
          <textarea
            className="ed-textarea"
            rows={3}
            value={slide.quote?.text || ''}
            onChange={(e) =>
              patch({
                quote: {
                  text: e.target.value,
                  attribution: slide.quote?.attribution || '',
                },
              })
            }
            placeholder="Quote text"
          />
          <input
            className="ed-input"
            style={{ marginTop: 8 }}
            value={slide.quote?.attribution || ''}
            onChange={(e) =>
              patch({
                quote: {
                  text: slide.quote?.text || '',
                  attribution: e.target.value,
                },
              })
            }
            placeholder="Attribution"
          />
        </div>
      )}

      <div className="ed-section">
        <label className="ed-label">Speaker notes</label>
        <textarea
          className="ed-textarea"
          rows={2}
          value={slide.speakerNotes}
          onChange={(e) => patch({ speakerNotes: e.target.value })}
          placeholder="Notes for the presenter"
        />
      </div>

      <div className="ed-divider" />

      <div className="ed-section">
        <label className="ed-label">Regenerate with AI</label>
        <textarea
          className="ed-textarea"
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Optional: 'Make it punchier', 'Focus on Q3 numbers', 'Add a customer angle'…"
          disabled={regenerating}
        />
        <button
          className="regen-btn"
          onClick={doRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <>
              <span className="spinner-sm" /> Regenerating…
            </>
          ) : (
            <>↻ Regenerate this slide</>
          )}
        </button>
        {regenError ? <div className="regen-error">⚠ {regenError}</div> : null}
        <p className="regen-hint">
          Uses gpt-5-mini for speed. The deck context is included automatically.
        </p>
      </div>
    </aside>
  )
}
