import { useMemo, useState } from 'react'
import './OptionsPage.css'
import { deckCostCents, parseLength } from '../lib/pricing.js'
import { DEFAULT_PREFS, loadDeckPrefs, resetDeckPrefs, saveDeckPrefs } from '../lib/deckPreferences.js'
import useFlashMessage from '../lib/useFlashMessage.js'

const lengths = ['4 cards', '8 cards', '12 cards', '16 cards']
const tones = ['Professional', 'Casual', 'Playful', 'Bold']

const MODES = [
  { id: 'concise', label: 'Concise', hint: 'Headlines only' },
  { id: 'default', label: 'Default', hint: 'Balanced slides' },
  { id: 'detailed', label: 'Detailed', hint: 'Full speaker script' },
]

const PRESET_THEMES = [
  { id: 'aurora',   name: 'Aurora',   primary: '#7c5cff', accent: '#ff6ea0', background: '#0f0f1a' },
  { id: 'midnight', name: 'Midnight', primary: '#4fc3f7', accent: '#00e5ff', background: '#050514' },
  { id: 'ember',    name: 'Ember',    primary: '#ff6b35', accent: '#ffd23f', background: '#160700' },
  { id: 'forest',   name: 'Forest',   primary: '#4caf7d', accent: '#a8e6cf', background: '#071610' },
  { id: 'ocean',    name: 'Ocean',    primary: '#2196f3', accent: '#00bcd4', background: '#020d1a' },
  { id: 'noir',     name: 'Noir',     primary: '#e0e0e0', accent: '#9e9e9e', background: '#0a0a0a' },
  { id: 'rose',     name: 'Rose',     primary: '#f48fb1', accent: '#ff80ab', background: '#1a0510' },
  { id: 'gold',     name: 'Gold',     primary: '#ffca28', accent: '#ffa000', background: '#120d00' },
]

export default function OptionsPage({
  defaults = {},
  onBack,
  onGenerate,
  onPlan,
  status = 'idle',
  error = '',
}) {
  // Last visit's choices, read once on mount, so the page reopens where the
  // user left it instead of resetting to the defaults.
  const [prefs] = useState(loadDeckPrefs)
  // A count written into the brief ("a 10-slide pitch") opens the panel on that
  // length instead of the remembered one; the visitor can still change it.
  const [length, setLength] = useState(defaults.length || prefs.length)
  // Presets are 4/8/12/16; a length carried in from the brief can be anything
  // from 3 to 20, so it gets its own segment instead of highlighting nothing.
  const lengthOptions = useMemo(
    () =>
      lengths.includes(length)
        ? lengths
        : [...lengths, length].sort((a, b) => parseLength(a) - parseLength(b)),
    [length],
  )
  const [tone, setTone] = useState(prefs.tone)
  const [language, setLanguage] = useState(prefs.language)
  const [mode, setMode] = useState(prefs.mode)
  const [themeId, setThemeId] = useState(() =>
    PRESET_THEMES.some((t) => t.id === prefs.themeId) ? prefs.themeId : null,
  )
  // Plan mode: carry these choices into the planning step instead of building
  // straight away. Planning is free; the deck is charged when it is built.
  const [planFirst, setPlanFirst] = useState(prefs.planFirst)
  // Saving is silent by design; this is the only confirmation the user sees.
  const [prefNotice, notifyPrefs] = useFlashMessage()

  function togglePlanFirst() {
    const next = !planFirst
    setPlanFirst(next)
    saveDeckPrefs({ planFirst: next })
    notifyPrefs(next ? 'Plan first saved' : 'Plan first off — saved')
  }

  // Nothing remembered is worth a reset button, so it disables itself once the
  // form already matches the defaults — that doubling as the click feedback.
  const isDefaultPrefs =
    length === DEFAULT_PREFS.length &&
    tone === DEFAULT_PREFS.tone &&
    language === DEFAULT_PREFS.language &&
    mode === DEFAULT_PREFS.mode &&
    themeId === null &&
    planFirst === DEFAULT_PREFS.planFirst

  function resetPrefs() {
    const defaults = resetDeckPrefs()
    setLength(defaults.length)
    setTone(defaults.tone)
    setLanguage(defaults.language)
    setMode(defaults.mode)
    setThemeId(null)
    setPlanFirst(defaults.planFirst)
    notifyPrefs('Preferences reset to defaults')
  }

  const isLoading = status === 'loading'
  const costLabel = `$${(deckCostCents(length) / 100).toFixed(2)}`

  function pickSurprise() {
    const idx = Math.floor(Math.random() * PRESET_THEMES.length)
    setThemeId(PRESET_THEMES[idx].id)
  }

  function handleGenerate() {
    if (isLoading) return
    const chosen = PRESET_THEMES.find((t) => t.id === themeId) || null
    const options = {
      length,
      tone,
      language,
      mode,
      userTheme: chosen
        ? { name: chosen.name, primary: chosen.primary, accent: chosen.accent, background: chosen.background }
        : null,
    }
    // Remember the picks for the next visit, whichever button was hit.
    saveDeckPrefs({ length, tone, language, mode, themeId, planFirst })
    notifyPrefs('Preferences saved')
    if (planFirst) {
      onPlan?.(options)
      return
    }
    onGenerate?.(options)
  }

  return (
    <div className="opts-page">
      <button className="opts-back" onClick={onBack} aria-label="Back">
        <span className="opts-back-arrow" aria-hidden>←</span>
        Back
      </button>

      <div className="opts-heading">
        <h1 className="opts-title">Customize your deck</h1>
        <p className="opts-sub">Choose a look and feel, then hit Generate.</p>
      </div>

      <div className="opts-sections">

        <section className="opts-section">
          <div className="opts-section-header">
            <span className="opts-section-label">Theme</span>
            <button className="surprise-btn" type="button" onClick={pickSurprise}>
              ✦ Surprise me
            </button>
          </div>
          <div className="theme-grid">
            <button
              type="button"
              className={`theme-card theme-card-ai ${themeId === null ? 'is-active' : ''}`}
              onClick={() => setThemeId(null)}
            >
              <div className="theme-preview ai-preview">
                <span className="ai-preview-icon">✦</span>
              </div>
              <span className="theme-name">AI picks</span>
              <span className="theme-ai-hint">Palette matched to your topic</span>
            </button>
            {PRESET_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-card ${themeId === t.id ? 'is-active' : ''}`}
                onClick={() => setThemeId(t.id)}
                title={t.name}
              >
                <div
                  className="theme-preview"
                  style={{ background: t.background }}
                >
                  <span className="theme-swatch" style={{ background: t.primary }} />
                  <span className="theme-swatch" style={{ background: t.accent }} />
                </div>
                <span className="theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="opts-section">
          <span className="opts-section-label">Depth</span>
          <div className="seg">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`seg-btn ${mode === m.id ? 'is-on' : ''}`}
                onClick={() => setMode(m.id)}
                title={m.hint}
              >
                {m.label}
                <span className="seg-hint">{m.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="opts-section">
          <span className="opts-section-label">Length</span>
          <div className="seg">
            {lengthOptions.map((l) => (
              <button
                key={l}
                type="button"
                className={`seg-btn ${length === l ? 'is-on' : ''}`}
                onClick={() => setLength(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="opts-section">
          <span className="opts-section-label">Tone</span>
          <div className="seg">
            {tones.map((t) => (
              <button
                key={t}
                type="button"
                className={`seg-btn ${tone === t ? 'is-on' : ''}`}
                onClick={() => setTone(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="opts-section">
          <span className="opts-section-label">Language</span>
          <select
            className="opts-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option>English</option>
            <option>Español</option>
            <option>Français</option>
            <option>Deutsch</option>
            <option>日本語</option>
          </select>
        </section>

      </div>

      {error ? <div className="opts-error">{error}</div> : null}

      <div className="opts-notice" role="status" aria-live="polite">
        {prefNotice}
      </div>

      <div className="opts-footer">
        <div className="opts-footer-left">
          <button
            type="button"
            className={`opts-plan ${planFirst ? 'is-on' : ''}`}
            onClick={togglePlanFirst}
            aria-pressed={planFirst}
            title="Answer a few questions and approve an outline before any slides are built"
          >
            <span className="opts-plan-dot" aria-hidden />
            Plan first
          </button>
          <button
            type="button"
            className="opts-reset"
            onClick={resetPrefs}
            disabled={isLoading || isDefaultPrefs}
            title="Forget the choices saved on this device and start from the defaults"
          >
            Reset defaults
          </button>
        </div>
        <button
          className="opts-generate-btn"
          disabled={isLoading}
          onClick={handleGenerate}
        >
          {isLoading ? (
            <><span className="spinner" /> Generating…</>
          ) : planFirst ? (
            <>
              Plan deck
              <span className="opts-generate-arrow" aria-hidden>→</span>
            </>
          ) : (
            <>
              Generate
              <span className="opts-generate-cost">{costLabel}</span>
              <span className="opts-generate-arrow" aria-hidden>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
