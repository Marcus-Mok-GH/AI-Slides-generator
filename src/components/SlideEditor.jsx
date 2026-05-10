import { useState, useRef, useCallback } from 'react'
import { regenerateSlide, redesignSlide } from '../lib/api.js'
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

function CollapsibleSection({ label, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`ed-section collapsible ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="ed-section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ed-label">{label}</span>
        <span className="ed-section-chevron" aria-hidden="true">›</span>
      </button>
      {open && <div className="ed-section-body">{children}</div>}
    </div>
  )
}

export default function SlideEditor({ deck, slideIndex, onChangeSlide, onClose }) {
  const slide = deck.slides[slideIndex]
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')
  const [redesignOpen, setRedesignOpen] = useState(false)
  const [redesignBrief, setRedesignBrief] = useState('')
  const [redesigning, setRedesigning] = useState(false)
  const [redesignError, setRedesignError] = useState('')

  // Swipe-to-dismiss state
  const touchStartY = useRef(0)
  const touchCurrentY = useRef(0)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const editorRef = useRef(null)

  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY
    touchCurrentY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!editorRef.current) return
    const currentY = e.touches[0].clientY
    const delta = currentY - touchStartY.current
    // Only allow downward swipes (positive delta) from the top area
    if (delta > 0 && touchStartY.current < editorRef.current.getBoundingClientRect().top + 80) {
      touchCurrentY.current = currentY
      setSwipeOffset(delta)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    const delta = touchCurrentY.current - touchStartY.current
    if (delta > 120 && onClose) {
      onClose()
    }
    setSwipeOffset(0)
  }, [onClose])

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

  async function doRedesign() {
    setRedesigning(true)
    setRedesignError('')
    try {
      const newSlide = await redesignSlide({
        deck,
        slideIndex,
        instruction: redesignBrief,
      })
      onChangeSlide(newSlide)
      setRedesignBrief('')
      setRedesignOpen(false)
    } catch (e) {
      setRedesignError(e.message || 'Failed to redesign')
    } finally {
      setRedesigning(false)
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
    <aside
      className="editor"
      ref={editorRef}
      style={swipeOffset > 0 ? { transform: `translateY(${swipeOffset}px)` } : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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

      <CollapsibleSection label="Layout">
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
      </CollapsibleSection>

      <CollapsibleSection label={slide.layout === 'statement' ? 'Statement' : 'Title'}>
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
      </CollapsibleSection>

      {slide.layout === 'section' && (
        <CollapsibleSection label="Section eyebrow">
          <input
            className="ed-input"
            value={slide.sectionLabel || ''}
            onChange={(e) => patch({ sectionLabel: e.target.value })}
            placeholder="e.g. Part 02 · Strategy"
          />
        </CollapsibleSection>
      )}

      {showBody && (
        <CollapsibleSection label={
          slide.layout === 'title'
            ? 'Subtitle'
            : slide.layout === 'statement'
              ? 'Optional sub-line'
              : 'Body'
        }>
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
        </CollapsibleSection>
      )}

      {showBullets && (
        <CollapsibleSection label="Bullets">
          <ListEditor
            items={slide.bullets || []}
            onChange={(b) => patch({ bullets: b })}
            placeholder="≤ 6 words"
            max={5}
          />
        </CollapsibleSection>
      )}

      {slide.layout === 'steps' && (
        <CollapsibleSection label="Steps">
          <StepsEditor
            steps={slide.steps || []}
            onChange={(v) => patch({ steps: v })}
          />
        </CollapsibleSection>
      )}

      {slide.layout === 'comparison' && (
        <CollapsibleSection label="Comparison">
          <ComparisonEditor
            comparison={slide.comparison}
            onChange={(v) => patch({ comparison: v })}
          />
        </CollapsibleSection>
      )}

      {slide.layout === 'stats' && (
        <CollapsibleSection label="Stats">
          <StatsEditor
            stats={slide.stats || []}
            onChange={(s) => patch({ stats: s })}
          />
        </CollapsibleSection>
      )}

      {slide.layout === 'quote' && (
        <CollapsibleSection label="Quote">
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
        </CollapsibleSection>
      )}

      <CollapsibleSection label="Speaker notes">
        <textarea
          className="ed-textarea"
          rows={2}
          value={slide.speakerNotes}
          onChange={(e) => patch({ speakerNotes: e.target.value })}
          placeholder="Notes for the presenter"
        />
      </CollapsibleSection>

      <div className="ed-divider" />

      <CollapsibleSection label="Regenerate with AI" defaultOpen={false}>
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
          Rewrites all the slide's content. The deck context is included automatically.
        </p>
      </CollapsibleSection>

      <div className="ed-divider" />

      <CollapsibleSection label="Redesign visuals only" defaultOpen={false}>
        {!redesignOpen ? (
          <>
            <button
              className="regen-btn"
              onClick={() => setRedesignOpen(true)}
              disabled={redesigning}
            >
              ✨ Redesign this slide's design
            </button>
            <p className="regen-hint">
              Keeps the wording and data — generates a fresh visual treatment
              (layout, accents, typography rhythm).
            </p>
          </>
        ) : (
          <>
            <textarea
              className="ed-textarea"
              rows={3}
              value={redesignBrief}
              onChange={(e) => setRedesignBrief(e.target.value)}
              placeholder="What would you like to change? e.g. 'More minimal, big numbers on the right', 'Editorial magazine feel', 'Add a numbered card grid'…"
              disabled={redesigning}
              autoFocus
            />
            <div className="redesign-actions">
              <button
                className="regen-btn"
                onClick={doRedesign}
                disabled={redesigning}
              >
                {redesigning ? (
                  <>
                    <span className="spinner-sm" /> Redesigning…
                  </>
                ) : (
                  <>↻ Apply redesign</>
                )}
              </button>
              <button
                type="button"
                className="redesign-cancel"
                onClick={() => {
                  setRedesignOpen(false)
                  setRedesignBrief('')
                  setRedesignError('')
                }}
                disabled={redesigning}
              >
                Cancel
              </button>
            </div>
            {redesignError ? (
              <div className="regen-error">⚠ {redesignError}</div>
            ) : null}
            <p className="regen-hint">
              Tip: leave the prompt empty for a surprise direction, or describe
              the look you want.
            </p>
          </>
        )}
      </CollapsibleSection>
    </aside>
  )
}
