import { useState } from 'react'
import './CreateHero.css'

const formats = [
  { id: 'presentation', icon: '▭', label: 'Presentation', hint: 'Slide-based deck' },
  { id: 'document', icon: '☰', label: 'Document', hint: 'Long-form page' },
  { id: 'webpage', icon: '◫', label: 'Webpage', hint: 'Shareable site' },
  { id: 'social', icon: '◉', label: 'Social', hint: 'Posts & carousels' },
]

const lengths = ['4 cards', '8 cards', '12 cards', 'Custom']
const tones = ['Professional', 'Casual', 'Playful', 'Bold']

const suggestions = [
  'A pitch deck for a B2B SaaS analytics tool',
  'Onboarding deck for new engineering hires',
  '10-slide product launch announcement',
  'Investor update for Q2 2026',
]

export default function CreateHero() {
  const [format, setFormat] = useState('presentation')
  const [prompt, setPrompt] = useState('')
  const [length, setLength] = useState('8 cards')
  const [tone, setTone] = useState('Professional')

  return (
    <section className="hero">
      <div className="hero-head">
        <span className="eyebrow">✦ AI generation</span>
        <h1 className="hero-title">
          What would you like to <span className="grad">create</span>?
        </h1>
        <p className="hero-sub">
          Describe a topic and we'll draft a beautiful deck in seconds. You can
          edit every card afterwards.
        </p>
      </div>

      <div className="format-tabs" role="tablist">
        {formats.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={format === f.id}
            className={`format-tab ${format === f.id ? 'is-active' : ''}`}
            onClick={() => setFormat(f.id)}
          >
            <span className="format-icon" aria-hidden>{f.icon}</span>
            <span className="format-label">{f.label}</span>
            <span className="format-hint">{f.hint}</span>
          </button>
        ))}
      </div>

      <div className="prompt-card">
        <div className="prompt-tools">
          <button className="chip">📎 Paste in text</button>
          <button className="chip">⤴ Import file</button>
          <button className="chip">🌐 From URL</button>
        </div>

        <textarea
          className="prompt-input"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A 10-slide investor pitch for an AI-powered legal research startup, focused on traction and the team."
        />

        <div className="prompt-controls">
          <div className="control-group">
            <label className="control-label">Length</label>
            <div className="seg">
              {lengths.map((l) => (
                <button
                  key={l}
                  className={`seg-btn ${length === l ? 'is-on' : ''}`}
                  onClick={() => setLength(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label className="control-label">Tone</label>
            <div className="seg">
              {tones.map((t) => (
                <button
                  key={t}
                  className={`seg-btn ${tone === t ? 'is-on' : ''}`}
                  onClick={() => setTone(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group grow">
            <label className="control-label">Language</label>
            <select className="select" defaultValue="English">
              <option>English</option>
              <option>Español</option>
              <option>Français</option>
              <option>Deutsch</option>
              <option>日本語</option>
            </select>
          </div>

          <button
            className="generate-btn"
            disabled={!prompt.trim()}
            onClick={() => {}}
          >
            Generate ✦
          </button>
        </div>
      </div>

      <div className="suggestions">
        <span className="sugg-title">Try:</span>
        {suggestions.map((s) => (
          <button
            key={s}
            className="sugg-chip"
            onClick={() => setPrompt(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  )
}
