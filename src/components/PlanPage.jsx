import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { planDeck, suggestPlanQuestions } from '../lib/api.js'
import { deckCostCents } from '../lib/pricing.js'
import { DEFAULT_DECK_OPTIONS } from '../lib/deckDefaults.js'
import './PlanPage.css'

/**
 * Plan mode.
 *
 * Step 1 asks for the spec — the questions whose answers change the deck.
 * Step 2 drafts a slide-by-slide plan the user can edit. Only when they hit
 * "Build deck" does generation start, with the approved plan attached so the
 * deck follows the outline they signed off on.
 */

const LENGTHS = ['4 cards', '8 cards', '12 cards', '16 cards']
const TONES = ['Professional', 'Casual', 'Playful', 'Bold']
const MODES = [
  { id: 'concise', label: 'Concise' },
  { id: 'default', label: 'Default' },
  { id: 'detailed', label: 'Detailed' },
]

export default function PlanPage({
  prompt,
  // Choices carried over from the composer or the Customize page, so plan mode
  // starts from what the user already picked instead of the defaults.
  defaults = {},
  onBack,
  onBuild,
  status = 'idle',
  error = '',
}) {
  const [stage, setStage] = useState('spec') // 'spec' | 'plan'
  const initial = useRef({
    length: defaults.length || DEFAULT_DECK_OPTIONS.length,
    tone: defaults.tone || DEFAULT_DECK_OPTIONS.tone,
    mode: defaults.mode || DEFAULT_DECK_OPTIONS.mode,
    language: defaults.language || DEFAULT_DECK_OPTIONS.language,
  })
  const [length, setLength] = useState(initial.current.length)
  const [tone, setTone] = useState(initial.current.tone)
  const [mode, setMode] = useState(initial.current.mode)

  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [questionsError, setQuestionsError] = useState('')
  const [answers, setAnswers] = useState({})
  const [notes, setNotes] = useState('')

  const [plan, setPlan] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState('')

  const isBuilding = status === 'streaming' || status === 'loading'
  const slideCount = plan?.slides?.length || 0
  const costLabel = `$${(deckCostCents(`${slideCount || 8} cards`) / 100).toFixed(2)}`

  // The questions are derived from the brief, not the controls, so they are
  // fetched once per prompt. A failure is not fatal — the brief alone is
  // enough to plan — so it degrades to a note instead of a dead end.
  useEffect(() => {
    let cancelled = false
    setQuestionsLoading(true)
    setQuestionsError('')
    suggestPlanQuestions({
      prompt,
      length: initial.current.length,
      tone: initial.current.tone,
    })
      .then((list) => {
        if (!cancelled) setQuestions(list)
      })
      .catch((e) => {
        if (cancelled) return
        setQuestions([])
        setQuestionsError(
          e?.message || 'Could not fetch questions — your brief is enough to plan from.',
        )
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [prompt])

  const draftPlan = useCallback(async () => {
    if (planning || isBuilding) return
    setPlanning(true)
    setPlanError('')
    try {
      const answered = questions
        .map((q) => ({
          id: q.id,
          question: q.question,
          answer: (answers[q.id] || '').trim(),
        }))
        .filter((a) => a.answer)
      if (notes.trim()) {
        answered.push({ id: 'notes', question: 'Anything else worth knowing', answer: notes.trim() })
      }

      const result = await planDeck({
        prompt,
        answers: answered,
        spec: { length, tone, mode, language: initial.current.language },
      })
      setPlan(result)
      setStage('plan')
    } catch (e) {
      setPlanError(e?.message || 'Could not draft a plan')
    } finally {
      setPlanning(false)
    }
  }, [answers, isBuilding, length, mode, notes, plan, planning, prompt, questions, tone])

  function updateSlide(index, patch) {
    setPlan((prev) => {
      if (!prev) return prev
      const slides = prev.slides.slice()
      slides[index] = { ...slides[index], ...patch }
      return { ...prev, slides }
    })
  }

  function removeSlide(index) {
    setPlan((prev) => {
      if (!prev || prev.slides.length <= 1) return prev
      return { ...prev, slides: prev.slides.filter((_, i) => i !== index) }
    })
  }

  function addSlide() {
    setPlan((prev) => {
      if (!prev || prev.slides.length >= 20) return prev
      return {
        ...prev,
        slides: [...prev.slides, { title: 'New slide', purpose: '', keyPoints: [] }],
      }
    })
  }

  function build() {
    if (!plan || !plan.slides?.length || isBuilding) return
    onBuild?.({
      length: `${plan.slides.length} cards`,
      tone,
      mode,
      language: initial.current.language,
      // Carried through untouched by App, which merges this over the payload
      // the composer stored.
      userTheme: defaults.userTheme || null,
      plan: {
        title: plan.title,
        subtitle: plan.subtitle,
        audience: plan.audience,
        narrative: plan.narrative,
        slides: plan.slides,
      },
    })
  }

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => (answers[q.id] || '').trim()).length +
      (notes.trim() ? 1 : 0),
    [answers, notes, questions],
  )

  return (
    <div className="plan-page">
      <button type="button" className="plan-back" onClick={onBack}>
        <span className="plan-back-arrow" aria-hidden>←</span>
        Back
      </button>

      <header className="plan-head">
        <span className="plan-kicker">Plan mode</span>
        <h1 className="plan-title">
          {stage === 'spec' ? 'Tell us what this deck has to do' : 'Read the plan, then build'}
        </h1>
        <p className="plan-lede">
          {stage === 'spec'
            ? 'A few specifics now save a rewrite later. Answer what matters — skip the rest.'
            : 'This outline is what the deck will follow. Edit any slide, then build.'}
        </p>
        <ol className="plan-steps" aria-label="Plan mode steps">
          <li className={stage === 'spec' ? 'is-on' : 'is-done'}>
            <span className="plan-step-no">1</span> Spec
          </li>
          <li className={stage === 'plan' ? 'is-on' : ''}>
            <span className="plan-step-no">2</span> Plan
          </li>
          <li>
            <span className="plan-step-no">3</span> Build
          </li>
        </ol>
      </header>

      <p className="plan-brief">
        <span className="plan-brief-label">Brief</span>
        {prompt}
      </p>

      {stage === 'spec' ? (
        <>
          <section className="plan-controls" aria-label="Deck options">
            <div className="plan-control">
              <span className="plan-control-label">Length</span>
              <div className="plan-seg">
                {LENGTHS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`plan-seg-btn ${length === l ? 'is-on' : ''}`}
                    onClick={() => setLength(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="plan-control">
              <span className="plan-control-label">Tone</span>
              <div className="plan-seg">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`plan-seg-btn ${tone === t ? 'is-on' : ''}`}
                    onClick={() => setTone(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="plan-control">
              <span className="plan-control-label">Depth</span>
              <div className="plan-seg">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`plan-seg-btn ${mode === m.id ? 'is-on' : ''}`}
                    onClick={() => setMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="plan-questions" aria-label="Questions about your deck">
            <div className="plan-section-head">
              <h2 className="plan-section-title">What we still need to know</h2>
              {questionsLoading ? (
                <span className="plan-section-note">Reading your brief…</span>
              ) : questions.length ? (
                <span className="plan-section-note">
                  {answeredCount} of {questions.length} answered
                </span>
              ) : null}
            </div>

            {questionsLoading ? (
              <div className="plan-skeleton" aria-hidden>
                <span /><span /><span />
              </div>
            ) : null}

            {!questionsLoading && questions.length === 0 ? (
              <p className="plan-empty">
                No extra questions for this brief — add anything we should know below,
                or draft the plan as-is.
              </p>
            ) : null}

            {questions.map((q) => (
              <div className="plan-question" key={q.id}>
                <label className="plan-question-label" htmlFor={`plan-q-${q.id}`}>
                  {q.question}
                </label>
                {q.why ? <p className="plan-question-why">{q.why}</p> : null}
                {q.suggestions.length ? (
                  <div className="plan-chips">
                    {q.suggestions.map((s) => {
                      const active = (answers[q.id] || '') === s
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`plan-chip ${active ? 'is-on' : ''}`}
                          onClick={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [q.id]: active ? '' : s,
                            }))
                          }
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <textarea
                  id={`plan-q-${q.id}`}
                  className="plan-answer"
                  rows={2}
                  value={answers[q.id] || ''}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  placeholder="Your answer (optional)"
                />
              </div>
            ))}

            {questionsError ? <div className="plan-alert">{questionsError}</div> : null}

            <div className="plan-question plan-question--notes">
              <label className="plan-question-label" htmlFor="plan-notes">
                Anything else worth knowing?
              </label>
              <textarea
                id="plan-notes"
                className="plan-answer"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Must-include facts, numbers to use, things to avoid, the room you're presenting in…"
              />
            </div>
          </section>

          {planError ? <div className="plan-alert">{planError}</div> : null}

          <div className="plan-footer">
            <span className="plan-footer-hint">Planning is free — you only pay when you build.</span>
            <button
              type="button"
              className="plan-primary"
              onClick={draftPlan}
              disabled={planning}
            >
              {planning ? (<><span className="plan-spinner" /> Drafting…</>) : (<>Draft the plan <span aria-hidden>→</span></>)}
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="plan-outline" aria-label="Deck outline">
            <div className="plan-outline-head">
              <label className="plan-field">
                <span className="plan-field-label">Deck title</span>
                <input
                  className="plan-input plan-input--title"
                  value={plan?.title || ''}
                  onChange={(e) => setPlan((prev) => ({ ...prev, title: e.target.value }))}
                  maxLength={200}
                />
              </label>
              <label className="plan-field">
                <span className="plan-field-label">Framing line</span>
                <input
                  className="plan-input"
                  value={plan?.subtitle || ''}
                  onChange={(e) => setPlan((prev) => ({ ...prev, subtitle: e.target.value }))}
                  maxLength={400}
                />
              </label>
              {plan?.audience ? (
                <p className="plan-outline-meta">
                  <span>Audience</span> {plan.audience}
                </p>
              ) : null}
              {plan?.narrative ? (
                <p className="plan-outline-meta">
                  <span>Arc</span> {plan.narrative}
                </p>
              ) : null}
            </div>

            <ol className="plan-slides">
              {(plan?.slides || []).map((slide, index) => (
                <li className="plan-slide" key={index}>
                  <div className="plan-slide-no" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="plan-slide-body">
                    <input
                      className="plan-input plan-input--slide"
                      value={slide.title}
                      onChange={(e) => updateSlide(index, { title: e.target.value })}
                      aria-label={`Slide ${index + 1} title`}
                      maxLength={200}
                    />
                    <input
                      className="plan-input plan-input--purpose"
                      value={slide.purpose || ''}
                      onChange={(e) => updateSlide(index, { purpose: e.target.value })}
                      placeholder="What this slide must accomplish"
                      aria-label={`Slide ${index + 1} purpose`}
                      maxLength={400}
                    />
                    <textarea
                      className="plan-input plan-input--points"
                      rows={Math.max(2, (slide.keyPoints || []).length)}
                      value={(slide.keyPoints || []).join('\n')}
                      onChange={(e) =>
                        updateSlide(index, {
                          keyPoints: e.target.value.split('\n').map((p) => p.trim()).filter(Boolean),
                        })
                      }
                      placeholder="One key point per line"
                      aria-label={`Slide ${index + 1} key points`}
                    />
                  </div>
                  <button
                    type="button"
                    className="plan-slide-remove"
                    onClick={() => removeSlide(index)}
                    disabled={(plan?.slides || []).length <= 1}
                    aria-label={`Remove slide ${index + 1}`}
                    title="Remove slide"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="plan-add"
              onClick={addSlide}
              disabled={(plan?.slides || []).length >= 20}
            >
              + Add a slide
            </button>
          </section>

          {planError ? <div className="plan-alert">{planError}</div> : null}
          {error ? <div className="plan-alert">{error}</div> : null}

          <div className="plan-footer">
            <div className="plan-footer-left">
              <button
                type="button"
                className="plan-secondary"
                onClick={() => setStage('spec')}
                disabled={isBuilding}
              >
                Edit answers
              </button>
              <button
                type="button"
                className="plan-secondary"
                onClick={draftPlan}
                disabled={planning || isBuilding}
              >
                {planning ? 'Redrafting…' : 'Redraft plan'}
              </button>
            </div>
            <button
              type="button"
              className="plan-primary"
              onClick={build}
              disabled={!slideCount || isBuilding}
            >
              {isBuilding ? (
                <><span className="plan-spinner" /> Building…</>
              ) : (
                <>
                  Build deck
                  <span className="plan-primary-cost">{costLabel}</span>
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
