import { useState } from 'react'
import { editSlide, regenerateSlide, redesignSlide } from '../lib/api.js'
import './SlideEditor.css'

const AI_EDIT_CHIPS = [
  'Make it more minimal',
  'Bigger title',
  'Tighten the wording',
  'More visual contrast',
]

export default function SlideEditor({ deck, slideIndex, onChangeSlide, onClose }) {
  const slide = deck.slides[slideIndex]
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiEditing, setAiEditing] = useState(false)
  const [aiError, setAiError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')
  const [redesignOpen, setRedesignOpen] = useState(false)
  const [redesignBrief, setRedesignBrief] = useState('')
  const [redesigning, setRedesigning] = useState(false)
  const [redesignError, setRedesignError] = useState('')

  function patch(partial) {
    onChangeSlide({ ...slide, ...partial })
  }

  async function doAiEdit() {
    setAiEditing(true)
    setAiError('')
    try {
      const newSlide = await editSlide({
        deck,
        slideIndex,
        instruction: aiPrompt,
      })
      onChangeSlide(newSlide)
      setAiPrompt('')
    } catch (e) {
      setAiError(e.message || 'Failed to edit slide')
    } finally {
      setAiEditing(false)
    }
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

  return (
    <aside className="editor">
      <div className="editor-head">
        <div className="editor-head-text">
          <span className="editor-eyebrow">Editing slide {slideIndex + 1}</span>
          <h3 className="editor-title">Edit slide</h3>
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
        <label className="ed-label">Title</label>
        <input
          className="ed-input"
          value={slide.title || ''}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Slide title"
        />
      </div>

      <div className="ed-section ai-edit-section">
        <label className="ed-label">Describe what to change</label>
        <textarea
          className="ed-textarea ai-edit-input"
          rows={3}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="e.g. Swap the list for three stat cards, and make the title punchier"
          spellCheck={false}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && aiPrompt.trim() && !aiEditing) {
              doAiEdit()
            }
          }}
        />
        <div className="ai-edit-chips">
          {AI_EDIT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="ai-edit-chip"
              onClick={() => setAiPrompt(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="regen-btn ai-apply-btn"
          disabled={aiEditing || !aiPrompt.trim()}
          onClick={doAiEdit}
        >
          {aiEditing ? (
            <>
              <span className="spinner-sm" /> Applying…
            </>
          ) : (
            'Apply edit ✦'
          )}
        </button>
        <p className="regen-hint">
          AI makes targeted edits to this slide — everything else stays untouched. (Ctrl+Enter)
        </p>
        {aiError && <div className="regen-error">{aiError}</div>}
      </div>

      <div className="ed-section">
        <label className="ed-label">Speaker notes</label>
        <textarea
          className="ed-textarea"
          rows={3}
          value={slide.speakerNotes || ''}
          onChange={(e) => patch({ speakerNotes: e.target.value })}
          placeholder="Notes for the presenter"
        />
      </div>

      <div className="ed-divider" />

      <div className="ed-section">
        <label className="ed-label">Regenerate HTML/CSS</label>
        <textarea
          className="ed-textarea"
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Optional: make it punchier, focus on Q3 numbers, add a customer angle..."
          disabled={regenerating}
        />
        <button
          className="regen-btn"
          onClick={doRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <>
              <span className="spinner-sm" /> Regenerating...
            </>
          ) : (
            <>↻ Regenerate this slide</>
          )}
        </button>
        {regenError ? <div className="regen-error">⚠ {regenError}</div> : null}
        <p className="regen-hint">
          Rewrites the slide content and produces new HTML/CSS using deck context.
        </p>
      </div>

      <div className="ed-divider" />

      <div className="ed-section">
        <label className="ed-label">Redesign visuals only</label>
        {!redesignOpen ? (
          <>
            <button
              className="regen-btn"
              onClick={() => setRedesignOpen(true)}
              disabled={redesigning}
            >
              ✨ Redesign this slide
            </button>
            <p className="regen-hint">
              Keeps the wording and data, then generates a fresh HTML/CSS visual treatment.
            </p>
          </>
        ) : (
          <>
            <textarea
              className="ed-textarea"
              rows={3}
              value={redesignBrief}
              onChange={(e) => setRedesignBrief(e.target.value)}
              placeholder="What should change? e.g. more minimal, editorial, denser data, bolder typography..."
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
                    <span className="spinner-sm" /> Redesigning...
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
          </>
        )}
      </div>
    </aside>
  )
}
