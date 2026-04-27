import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import './CreateHero.css'

const formats = [
  { id: 'presentation', icon: '▭', label: 'Presentation', hint: 'Slide-based deck' },
  { id: 'document', icon: '☰', label: 'Document', hint: 'Long-form page' },
  { id: 'webpage', icon: '◫', label: 'Webpage', hint: 'Shareable site' },
  { id: 'social', icon: '◉', label: 'Social', hint: 'Posts & carousels' },
]

const lengths = ['4 cards', '8 cards', '12 cards', '16 cards']
const tones = ['Professional', 'Casual', 'Playful', 'Bold']

const suggestions = [
  'A pitch deck for a B2B SaaS analytics tool',
  'Onboarding deck for new engineering hires',
  '10-slide product launch announcement',
  'Investor update for Q2 2026',
]

// Templates the parent (App.jsx) can hand off via the ref.
const TEMPLATE_PROMPTS = {
  'Pitch deck':
    'A 10-slide investor pitch deck for [your startup]: problem, solution, market size, product, traction, business model, competition, team, ask, and vision.',
  'Sales proposal':
    'A 6-slide sales proposal for [client]: their goals, our recommended solution, scope of work, timeline, pricing tiers, and next steps.',
  'Product launch':
    'An 8-slide product launch deck for [product]: what it is, who it\'s for, the problem it solves, key features, demo, pricing, GTM plan, and how to try it.',
  'Quarterly review':
    'A 10-slide Q[X] [YEAR] business review: highlights, KPIs vs target, wins, misses, customer stories, product progress, financials, lessons, priorities for next quarter.',
  Workshop:
    'An 8-slide workshop deck on [topic]: agenda, why it matters, core concept, framework, walkthrough example, hands-on exercise, recap, and resources.',
  'Case study':
    'A 6-slide customer case study about [customer]: their context, the challenge, the solution we built, implementation, measurable results, and a quote.',
}

const CreateHero = forwardRef(function CreateHero(
  { onGenerate, status = 'idle', error = '' },
  ref,
) {
  const [format, setFormat] = useState('presentation')
  const [prompt, setPrompt] = useState('')
  const [length, setLength] = useState('8 cards')
  const [tone, setTone] = useState('Professional')
  const [language, setLanguage] = useState('English')
  const [chipBusy, setChipBusy] = useState('') // 'paste' | 'file' | 'url' | ''
  const [chipError, setChipError] = useState('')
  const isLoading = status === 'loading'
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  useImperativeHandle(
    ref,
    () => ({
      focusPrompt() {
        textareaRef.current?.focus()
        textareaRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      },
      applyTemplate(name) {
        const text = TEMPLATE_PROMPTS[name]
        if (text) {
          setPrompt(text)
          setTimeout(() => {
            textareaRef.current?.focus()
            textareaRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }, 0)
        }
      },
    }),
    [],
  )

  function submit() {
    if (!prompt.trim() || isLoading) return
    onGenerate?.({
      prompt: prompt.trim(),
      format,
      length,
      tone,
      language,
    })
  }

  async function handlePaste() {
    setChipError('')
    setChipBusy('paste')
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error(
          'Your browser blocks clipboard reads. Paste with Ctrl+V instead.',
        )
      }
      const text = await navigator.clipboard.readText()
      if (!text?.trim()) {
        throw new Error('Clipboard is empty.')
      }
      setPrompt((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${text.trim()}` : text.trim(),
      )
      textareaRef.current?.focus()
    } catch (e) {
      setChipError(e.message || 'Could not read clipboard')
    } finally {
      setChipBusy('')
    }
  }

  function handleFilePick() {
    setChipError('')
    fileInputRef.current?.click()
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so the same file can be re-picked
    if (!file) return
    setChipBusy('file')
    try {
      if (file.size > 1_000_000) {
        throw new Error('File is too large (max 1 MB).')
      }
      const text = await file.text()
      if (!text.trim()) throw new Error('File is empty.')
      const trimmed = text.slice(0, 8000).trim()
      setPrompt(
        `Build a deck based on this content:\n\n"""\n${trimmed}\n"""`,
      )
      textareaRef.current?.focus()
    } catch (err) {
      setChipError(err.message || 'Could not read file')
    } finally {
      setChipBusy('')
    }
  }

  async function handleFromUrl() {
    setChipError('')
    const url = window.prompt(
      'Paste a public URL to import as deck content:',
      'https://',
    )
    if (!url || url.trim() === 'https://') return
    setChipBusy('url')
    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`)
      const title = data?.title ? `Title: ${data.title}\n\n` : ''
      const body = (data?.text || '').slice(0, 4000)
      if (!body.trim()) throw new Error('No readable text found at that URL.')
      setPrompt(
        `Build a deck based on this article (${data.url}).\n\n${title}${body}`,
      )
      textareaRef.current?.focus()
    } catch (err) {
      setChipError(err.message || 'Could not fetch URL')
    } finally {
      setChipBusy('')
    }
  }

  return (
    <section className="hero" id="create-hero">
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
          <button
            type="button"
            className="chip"
            onClick={handlePaste}
            disabled={chipBusy === 'paste'}
          >
            {chipBusy === 'paste' ? '… Pasting' : '📎 Paste in text'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={handleFilePick}
            disabled={chipBusy === 'file'}
          >
            {chipBusy === 'file' ? '… Reading' : '⤴ Import file'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={handleFromUrl}
            disabled={chipBusy === 'url'}
          >
            {chipBusy === 'url' ? '… Fetching' : '🌐 From URL'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.json,text/*"
            style={{ display: 'none' }}
            onChange={handleFileChosen}
          />
        </div>

        {chipError ? (
          <div className="chip-error">⚠ {chipError}</div>
        ) : null}

        <textarea
          ref={textareaRef}
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
            <select
              className="select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option>English</option>
              <option>Español</option>
              <option>Français</option>
              <option>Deutsch</option>
              <option>日本語</option>
            </select>
          </div>

          <button
            className="generate-btn"
            disabled={!prompt.trim() || isLoading}
            onClick={submit}
          >
            {isLoading ? (
              <>
                <span className="spinner" /> Generating…
              </>
            ) : (
              <>Generate ✦</>
            )}
          </button>
        </div>

        {error ? <div className="error-banner">⚠ {error}</div> : null}
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
})

export default CreateHero
