import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import './CreateHero.css'

const formats = [
  { id: 'presentation', icon: '▭', label: 'Presentation' },
  { id: 'document', icon: '☰', label: 'Document' },
  { id: 'webpage', icon: '◫', label: 'Webpage' },
  { id: 'social', icon: '◉', label: 'Social' },
]

const suggestions = [
  'A pitch deck for a B2B SaaS analytics tool',
  'Onboarding deck for new engineering hires',
  '10-slide product launch announcement',
  'Investor update for Q2 2026',
]

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
  { onContinue, status = 'idle', error = '' },
  ref,
) {
  const [format, setFormat] = useState('presentation')
  const [prompt, setPrompt] = useState('')
  const [chipBusy, setChipBusy] = useState('')
  const [chipError, setChipError] = useState('')
  const [promptHistory, setPromptHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const isLoading = status === 'loading'
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const historyRef = useRef(null)

  // Fetch prompt history from the server
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/prompt-history')
      if (!res.ok) return
      const data = await res.json()
      setPromptHistory(data.history || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return
    function handleClick(e) {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showHistory])

  async function deleteHistoryItem(e, id) {
    e.stopPropagation()
    try {
      await fetch(`/api/prompt-history/${id}`, { method: 'DELETE' })
      setPromptHistory((prev) => prev.filter((h) => h.id !== id))
    } catch {}
  }

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
      applyPrompt(text) {
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
    onContinue?.({ prompt: prompt.trim(), format })
  }

  async function handlePaste() {
    setChipError('')
    setChipBusy('paste')
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('Your browser blocks clipboard reads. Paste with Ctrl+V instead.')
      }
      const text = await navigator.clipboard.readText()
      if (!text?.trim()) throw new Error('Clipboard is empty.')
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
    e.target.value = ''
    if (!file) return
    setChipBusy('file')
    try {
      if (file.size > 1_000_000) throw new Error('File is too large (max 1 MB).')
      const text = await file.text()
      if (!text.trim()) throw new Error('File is empty.')
      setPrompt(`Build a deck based on this content:\n\n"""\n${text.slice(0, 8000).trim()}\n"""`)
      textareaRef.current?.focus()
    } catch (err) {
      setChipError(err.message || 'Could not read file')
    } finally {
      setChipBusy('')
    }
  }

  async function handleFromUrl() {
    setChipError('')
    const url = window.prompt('Paste a public URL to import as deck content:', 'https://')
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
      setPrompt(`Build a deck based on this article (${data.url}).\n\n${title}${body}`)
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
        <h1 className="hero-title">
          What would you like to <span className="grad">create</span>?
        </h1>
        <p className="hero-sub">
          Describe your topic and we'll build a beautiful deck in seconds.
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
          </button>
        ))}
      </div>

      <div className="prompt-card">
        <div className="prompt-tools">
          <button type="button" className="chip" onClick={handlePaste} disabled={chipBusy === 'paste'}>
            {chipBusy === 'paste' ? 'Pasting…' : 'Paste text'}
          </button>
          <button type="button" className="chip" onClick={handleFilePick} disabled={chipBusy === 'file'}>
            {chipBusy === 'file' ? 'Reading…' : 'Import file'}
          </button>
          <button type="button" className="chip" onClick={handleFromUrl} disabled={chipBusy === 'url'}>
            {chipBusy === 'url' ? 'Fetching…' : 'From URL'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.json,text/*"
            style={{ display: 'none' }}
            onChange={handleFileChosen}
          />
        </div>

        {chipError ? <div className="chip-error">{chipError}</div> : null}

        <textarea
          ref={textareaRef}
          className="prompt-input"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
          placeholder="e.g. A 10-slide investor pitch for an AI-powered legal research startup, focused on traction and the team."
        />

        {prompt.length > 400 && (
          <div className={`prompt-counter ${prompt.length > 800 ? 'is-warn' : ''}`}>
            {prompt.trim().split(/\s+/).filter(Boolean).length} words · {prompt.length} chars
          </div>
        )}

        <div className="prompt-bottom">
          {promptHistory.length > 0 && (
            <div className="history-wrapper" ref={historyRef}>
              <button
                type="button"
                className={`options-toggle ${showHistory ? 'is-open' : ''}`}
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
              >
                Recent
                <span className={`options-caret ${showHistory ? 'is-up' : ''}`} aria-hidden>▾</span>
              </button>

              <div className={`history-dropdown ${showHistory ? 'is-open' : ''}`} role="listbox">
                {promptHistory.map((item) => (
                  <div
                    key={item.id}
                    className="history-item"
                    role="option"
                    tabIndex={0}
                    onClick={() => {
                      setPrompt(item.prompt)
                      setShowHistory(false)
                      setTimeout(() => textareaRef.current?.focus(), 0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setPrompt(item.prompt)
                        setShowHistory(false)
                        setTimeout(() => textareaRef.current?.focus(), 0)
                      }
                    }}
                  >
                    <span className="history-item-text">{item.prompt}</span>
                    <button
                      className="history-item-delete"
                      title="Remove"
                      aria-label="Remove from history"
                      onClick={(e) => deleteHistoryItem(e, item.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="generate-btn"
            disabled={!prompt.trim() || isLoading}
            onClick={submit}
            title="Continue (Ctrl+Enter)"
          >
            Continue
            <span style={{ fontSize: '15px', lineHeight: 1 }} aria-hidden>→</span>
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
      </div>

      <div className="suggestions">
        <span className="sugg-title">Try:</span>
        {suggestions.map((s) => (
          <button key={s} className="sugg-chip" onClick={() => setPrompt(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  )
})

export default CreateHero
