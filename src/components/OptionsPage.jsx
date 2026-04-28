import { useState } from 'react'
import './OptionsPage.css'

const formats = [
  { id: 'presentation', icon: '▭', label: 'Presentation' },
  { id: 'document', icon: '☰', label: 'Document' },
  { id: 'webpage', icon: '◫', label: 'Webpage' },
  { id: 'social', icon: '◉', label: 'Social' },
]

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

export default function OptionsPage({ initialFormat = 'presentation', onBack, onGenerate, status = 'idle', error = '' }) {
  const [format, setFormat] = useState(initialFormat)
  const [length, setLength] = useState('8 cards')
  const [tone, setTone] = useState('Professional')
  const [language, setLanguage] = useState('English')
  const [mode, setMode] = useState('default')
  const [themeId, setThemeId] = useState(null)

  const isLoading = status === 'loading'

  function pickSurprise() {
    const idx = Math.floor(Math.random() * PRESET_THEMES.length)
    setThemeId(PRESET_THEMES[idx].id)
  }

  function handleGenerate() {
    if (isLoading) return
    const chosen = PRESET_THEMES.find((t) => t.id === themeId) || null
    onGenerate?.({
      format,
      length,
      tone,
      language,
      mode: format === 'presentation' ? mode : 'default',
      userTheme: chosen
        ? { name: chosen.name, primary: chosen.primary, accent: chosen.accent, background: chosen.background }
        : null,
    })
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
          <span className="opts-section-label">Format</span>
          <div className="opts-format-tabs">
            {formats.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`opts-format-tab ${format === f.id ? 'is-active' : ''}`}
                onClick={() => setFormat(f.id)}
              >
                <span className="opts-format-icon" aria-hidden>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>
        </section>

        {format === 'presentation' && (
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
        )}

        <section className="opts-section">
          <span className="opts-section-label">Length</span>
          <div className="seg">
            {lengths.map((l) => (
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

      <div className="opts-footer">
        <button
          className="opts-generate-btn"
          disabled={isLoading}
          onClick={handleGenerate}
        >
          {isLoading ? (
            <><span className="spinner" /> Generating…</>
          ) : (
            <>Generate<span className="opts-generate-arrow" aria-hidden>→</span></>
          )}
        </button>
      </div>
    </div>
  )
}
