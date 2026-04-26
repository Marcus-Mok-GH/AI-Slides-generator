import { useState } from 'react'
import { regenerateSlide } from '../lib/api.js'
import './SlideEditor.css'

const LAYOUTS = [
  { id: 'title', label: 'Title', hint: 'Hero / cover slide' },
  { id: 'section', label: 'Section', hint: 'Section divider' },
  { id: 'statement', label: 'Statement', hint: 'One bold sentence' },
  { id: 'bullets', label: 'Bullets', hint: 'Punchy card grid' },
  { id: 'steps', label: 'Steps', hint: 'Numbered process' },
  { id: 'comparison', label: 'Compare', hint: 'A vs B' },
  { id: 'stats', label: 'Stats', hint: 'KPI numbers' },
  { id: 'quote', label: 'Quote', hint: 'Pull quote' },
  { id: 'two-column', label: 'Two-col', hint: 'Prose + bullets' },
  { id: 'content', label: 'Content', hint: 'Title + subhead' },
]

function ListEditor({ items, onChange, placeholder, max = 8 }) {
  const update = (i, val) => {
    const next = [...items]
    next[i] = val
    onChange(next)
  }
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
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
          <button className="row-x" onClick={() => remove(i)} aria-label="Remove">
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
            placeholder="92%"
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

function StepsEditor({ steps, onChange }) {
  const update = (i, key, val) => {
    const next = steps.map((s, idx) =>
      idx === i ? { ...s, [key]: val } : s,
    )
    onChange(next)
  }
  const remove = (i) => onChange(steps.filter((_, idx) => idx !== i))
  const add = () => {
    if (steps.length >= 6) return
    onChange([...steps, { label: '', detail: '' }])
  }
  return (
    <div className="list-edit">
      {steps.map((s, i) => (
        <div key={i} className="stat-row">
          <input
            className="ed-input value"
            value={s.label}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="Step name"
          />
          <input
            className="ed-input"
            value={s.detail}
            onChange={(e) => update(i, 'detail', e.target.value)}
            placeholder="Short detail"
          />
          <button className="row-x" onClick={() => remove(i)} aria-label="Remove">
            ×
          </button>
        </div>
      ))}
      {steps.length < 6 && (
        <button className="add-row" onClick={add}>
          + Add step
        </button>
      )}
    </div>
  )
}

function ComparisonEditor({ comparison, onChange }) {
  const cmp = comparison || {
    leftLabel: 'Before',
    leftItems: [],
    rightLabel: 'After',
    rightItems: [],
  }
  const set = (key, val) => onChange({ ...cmp, [key]: val })

  return (
    <div className="cmp-edit">
      <div className="cmp-edit-col">
        <input
          className="ed-input"
          value={cmp.leftLabel}
          onChange={(e) => set('leftLabel', e.target.value)}
          placeholder="Left label"
        />
        <ListEditor
          items={cmp.leftItems || []}
          onChange={(v) => set('leftItems', v)}
          placeholder="Item"
          max={5}
        />
      </div>
      <div className="cmp-edit-col">
        <input
          className="ed-input"
          value={cmp.rightLabel}
          onChange={(e) => set('rightLabel', e.target.value)}
          placeholder="Right label"
        />
        <ListEditor
          items={cmp.rightItems || []}
          onChange={(v) => set('rightItems', v)}
          placeholder="Item"
          max={5}
        />
      </div>
    </div>
  )
}

export default function SlideEditor({ deck, slideIndex, onChangeSlide, onClose }) {
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

  const showBody =
    slide.layout === 'title' ||
    slide.layout === 'content' ||
    slide.layout === 'two-column' ||
    slide.layout === 'statement'

  const showBullets =
    slide.layout === 'bullets' ||
    slide.layout === 'two-column' ||
    slide.layout === 'content'

  return (
    <aside className="editor">
      <div className="editor-head">
        <div className="editor-head-text">
          <span className="editor-eyebrow">Editing slide {slideIndex + 1}</span>
          <h3 className="editor-title">Card properties</h3>
        </div>
        {onClose && (
          <button
            type="button"
            className="editor-close"
            onClick={onClose}
            aria-label="Close editor"
          >
            ×
          </button>
        )}
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
        <label className="ed-label">
          {slide.layout === 'statement' ? 'Statement' : 'Title'}
        </label>
        <input
          className="ed-input"
          value={slide.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={
            slide.layout === 'statement'
              ? 'One bold sentence'
              : 'Slide title'
          }
        />
      </div>

      {slide.layout === 'section' && (
        <div className="ed-section">
          <label className="ed-label">Section eyebrow</label>
          <input
            className="ed-input"
            value={slide.sectionLabel || ''}
            onChange={(e) => patch({ sectionLabel: e.target.value })}
            placeholder="e.g. Part 02 · Strategy"
          />
        </div>
      )}

      {showBody && (
        <div className="ed-section">
          <label className="ed-label">
            {slide.layout === 'title'
              ? 'Subtitle'
              : slide.layout === 'statement'
                ? 'Optional sub-line'
                : 'Body'}
          </label>
          <textarea
            className="ed-textarea"
            rows={3}
            value={slide.body}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder={
              slide.layout === 'title'
                ? 'One-sentence subtitle'
                : slide.layout === 'statement'
                  ? 'Optional one-line context'
                  : 'Short subhead (≤ 18 words)'
            }
          />
        </div>
      )}

      {showBullets && (
        <div className="ed-section">
          <label className="ed-label">Bullets</label>
          <ListEditor
            items={slide.bullets || []}
            onChange={(b) => patch({ bullets: b })}
            placeholder="≤ 6 words"
            max={5}
          />
        </div>
      )}

      {slide.layout === 'steps' && (
        <div className="ed-section">
          <label className="ed-label">Steps</label>
          <StepsEditor
            steps={slide.steps || []}
            onChange={(v) => patch({ steps: v })}
          />
        </div>
      )}

      {slide.layout === 'comparison' && (
        <div className="ed-section">
          <label className="ed-label">Comparison</label>
          <ComparisonEditor
            comparison={slide.comparison}
            onChange={(v) => patch({ comparison: v })}
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
