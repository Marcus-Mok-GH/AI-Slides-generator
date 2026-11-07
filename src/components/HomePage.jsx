import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import './HomePage.css'

/* -------------------------------------------------------------------------
   Static content
   ------------------------------------------------------------------------- */

const FORMATS = [
  { id: 'presentation', label: 'Presentation' },
  { id: 'document', label: 'Document' },
  { id: 'webpage', label: 'Webpage' },
  { id: 'social', label: 'Social' },
]

const STARTERS = [
  {
    label: 'Investor pitch',
    hint: 'Traction-led · 10 slides',
    prompt:
      'A 10-slide seed-round pitch for a climate-tech startup turning warehouse waste heat into electricity: problem, solution, market size, product, traction, business model, competition, team, ask, and vision.',
  },
  {
    label: 'Product launch',
    hint: 'GTM-ready · 8 slides',
    prompt:
      'An 8-slide product launch deck for a note-taking app built for engineering teams: what it is, who it is for, the problem it solves, key features, a demo walkthrough, pricing, launch plan, and how to get started.',
  },
  {
    label: 'Quarterly review',
    hint: 'Board update · 10 slides',
    prompt:
      'A 10-slide Q3 2026 business review for a 40-person SaaS company: highlights, KPIs vs target, wins, misses, customer stories, product progress, financials, lessons learned, and next-quarter priorities.',
  },
  {
    label: 'Team workshop',
    hint: 'Teaching deck · 8 slides',
    prompt:
      'An 8-slide workshop on prompt engineering for marketers: agenda, why it matters, the core framework, worked examples, hands-on exercise, recap, and further resources.',
  },
]

const TEMPLATES = [
  {
    name: 'Pitch deck',
    tag: 'Startup',
    art: 'bars',
    prompt:
      'A 10-slide investor pitch deck for [your startup]: problem, solution, market size, product, traction, business model, competition, team, ask, and vision.',
  },
  {
    name: 'Product launch',
    tag: 'Marketing',
    art: 'split',
    prompt:
      "An 8-slide product launch deck for [product]: what it is, who it's for, the problem it solves, key features, demo, pricing, GTM plan, and how to try it.",
  },
  {
    name: 'Quarterly review',
    tag: 'Internal',
    art: 'donut',
    prompt:
      'A 10-slide Q[X] [YEAR] business review: highlights, KPIs vs target, wins, misses, customer stories, product progress, financials, lessons, priorities for next quarter.',
  },
  {
    name: 'Sales proposal',
    tag: 'Business',
    art: 'steps',
    prompt:
      'A 6-slide sales proposal for [client]: their goals, our recommended solution, scope of work, timeline, pricing tiers, and next steps.',
  },
  {
    name: 'Workshop',
    tag: 'Education',
    art: 'title',
    prompt:
      'An 8-slide workshop deck on [topic]: agenda, why it matters, core concept, framework, walkthrough example, hands-on exercise, recap, and resources.',
  },
  {
    name: 'Case study',
    tag: 'Marketing',
    art: 'quote',
    prompt:
      'A 6-slide customer case study about [customer]: their context, the challenge, the solution we built, implementation, measurable results, and a quote.',
  },
]

/* -------------------------------------------------------------------------
   Icons
   ------------------------------------------------------------------------- */

const iconProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const FORMAT_ICONS = {
  presentation: (
    <svg {...iconProps}>
      <rect x="2.75" y="3.5" width="14.5" height="9.5" rx="2" />
      <path d="M10 13v3.5M6.5 16.5h7" />
    </svg>
  ),
  document: (
    <svg {...iconProps}>
      <rect x="4" y="2.5" width="12" height="15" rx="2" />
      <path d="M7 7h6M7 10h6M7 13h4" />
    </svg>
  ),
  webpage: (
    <svg {...iconProps}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M2.5 7h15M5.2 5.3h.01M7.6 5.3h.01" />
    </svg>
  ),
  social: (
    <svg {...iconProps}>
      <rect x="5.5" y="2.5" width="9" height="15" rx="2.5" />
      <path d="M9 15.2h2" />
    </svg>
  ),
}

const TOOL_ICONS = {
  paste: (
    <svg {...iconProps}>
      <rect x="5.5" y="4" width="9" height="13" rx="1.75" />
      <path d="M8 4V3.2A1.2 1.2 0 0 1 9.2 2h1.6A1.2 1.2 0 0 1 12 3.2V4M8 8.5h4M8 11.5h4" />
    </svg>
  ),
  upload: (
    <svg {...iconProps}>
      <path d="M10 12.5V3.5M6.8 6.5 10 3.3l3.2 3.2" />
      <path d="M3.5 12.5v3a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </svg>
  ),
  link: (
    <svg {...iconProps}>
      <path d="M8.3 11.7a3.2 3.2 0 0 0 4.6 0l2.2-2.2a3.3 3.3 0 0 0-4.6-4.6L9.4 6.1" />
      <path d="M11.7 8.3a3.2 3.2 0 0 0-4.6 0L4.9 10.5a3.3 3.3 0 0 0 4.6 4.6l1.1-1.2" />
    </svg>
  ),
  clock: (
    <svg {...iconProps}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.6 1.6" />
    </svg>
  ),
  arrow: (
    <svg {...iconProps}>
      <path d="M3.75 10h12.5M11 4.75 16.25 10 11 15.25" />
    </svg>
  ),
  spark: (
    <svg {...iconProps}>
      <path d="M10 2.5c.6 3.9 2 5.3 5.9 5.9-3.9.6-5.3 2-5.9 5.9-.6-3.9-2-5.3-5.9-5.9 3.9-.6 5.3-2 5.9-5.9Z" />
      <path d="M15.8 13.2c.25 1.6.85 2.2 2.45 2.45-1.6.25-2.2.85-2.45 2.45-.25-1.6-.85-2.2-2.45-2.45 1.6-.25 2.2-.85 2.45-2.45Z" />
    </svg>
  ),
}

/* -------------------------------------------------------------------------
   Prompt composer
   ------------------------------------------------------------------------- */

const Composer = forwardRef(function Composer(
  { onContinue, status = 'idle', error = '' },
  ref,
) {
  const [format, setFormat] = useState('presentation')
  const [prompt, setPrompt] = useState('')
  const [chipBusy, setChipBusy] = useState('')
  const [chipError, setChipError] = useState('')
  const [promptHistory, setPromptHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const historyRef = useRef(null)
  const isLoading = status === 'loading'

  const focusPrompt = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const applyPrompt = useCallback(
    (text) => {
      if (!text) return
      setPrompt(text)
      setTimeout(focusPrompt, 0)
    },
    [focusPrompt],
  )

  useImperativeHandle(ref, () => ({ focusPrompt, applyPrompt }))

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

  useEffect(() => {
    if (!showHistory) return
    function onDown(e) {
      if (historyRef.current && !historyRef.current.contains(e.target)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showHistory])

  async function deleteHistoryItem(e, id) {
    e.stopPropagation()
    try {
      await fetch(`/api/prompt-history/${id}`, { method: 'DELETE' })
      setPromptHistory((prev) => prev.filter((h) => h.id !== id))
    } catch {}
  }

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
      focusPrompt()
    } catch (e) {
      setChipError(e.message || 'Could not read clipboard')
    } finally {
      setChipBusy('')
    }
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setChipError('')
    setChipBusy('file')
    try {
      if (file.size > 1_000_000) throw new Error('File is too large (max 1 MB).')
      const text = await file.text()
      if (!text.trim()) throw new Error('File is empty.')
      setPrompt(`Build a deck based on this content:\n\n"""\n${text.slice(0, 8000).trim()}\n"""`)
      focusPrompt()
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
      focusPrompt()
    } catch (err) {
      setChipError(err.message || 'Could not fetch URL')
    } finally {
      setChipBusy('')
    }
  }

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="composer-head">
        <div className="composer-heading">
          <span className="composer-kicker">New deck</span>
          <h2 className="composer-title">What are we presenting?</h2>
        </div>
        <span className="composer-step">Step 1 / 2</span>
      </div>

      <div className="composer-formats" role="tablist" aria-label="Deck format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={format === f.id}
            className={`composer-format ${format === f.id ? 'is-on' : ''}`}
            onClick={() => setFormat(f.id)}
          >
            <span className="composer-format-icon">{FORMAT_ICONS[f.id]}</span>
            <span className="composer-format-label">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="composer-field">
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
          placeholder="Try: a 10-slide pitch for an AI legal-research startup, leading with traction and the founding team…"
          aria-label="Describe your deck"
        />
        {prompt.length > 400 ? (
          <div className={`composer-counter ${prompt.length > 800 ? 'is-warn' : ''}`}>
            {wordCount} words · {prompt.length} chars
          </div>
        ) : null}
      </div>

      <div className="composer-tools">
        <button
          type="button"
          className="composer-tool"
          onClick={handlePaste}
          disabled={chipBusy === 'paste'}
        >
          <span className="composer-tool-icon">{TOOL_ICONS.paste}</span>
          <span className="composer-tool-label">
            {chipBusy === 'paste' ? 'Pasting…' : 'Paste text'}
          </span>
        </button>
        <button
          type="button"
          className="composer-tool"
          onClick={() => fileInputRef.current?.click()}
          disabled={chipBusy === 'file'}
        >
          <span className="composer-tool-icon">{TOOL_ICONS.upload}</span>
          <span className="composer-tool-label">
            {chipBusy === 'file' ? 'Reading…' : 'Import file'}
          </span>
        </button>
        <button
          type="button"
          className="composer-tool"
          onClick={handleFromUrl}
          disabled={chipBusy === 'url'}
        >
          <span className="composer-tool-icon">{TOOL_ICONS.link}</span>
          <span className="composer-tool-label">
            {chipBusy === 'url' ? 'Fetching…' : 'From URL'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.csv,.json,text/*"
          hidden
          onChange={handleFileChosen}
        />

        {promptHistory.length > 0 ? (
          <div className="composer-history" ref={historyRef}>
            <button
              type="button"
              className={`composer-tool composer-tool--recent ${showHistory ? 'is-open' : ''}`}
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              <span className="composer-tool-icon">{TOOL_ICONS.clock}</span>
              <span className="composer-tool-label">Recent</span>
            </button>
            <div
              className={`composer-history-menu ${showHistory ? 'is-open' : ''}`}
              role="listbox"
              aria-label="Recent prompts"
            >
              {promptHistory.map((item) => (
                <div
                  key={item.id}
                  className="composer-history-item"
                  role="option"
                  tabIndex={0}
                  onClick={() => {
                    applyPrompt(item.prompt)
                    setShowHistory(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      applyPrompt(item.prompt)
                      setShowHistory(false)
                    }
                  }}
                >
                  <span className="composer-history-text">{item.prompt}</span>
                  <button
                    type="button"
                    className="composer-history-delete"
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
        ) : null}
      </div>

      {chipError ? <div className="composer-alert">{chipError}</div> : null}
      {error ? <div className="composer-alert">{error}</div> : null}

      <div className="composer-foot">
        <span className="composer-hint">
          <kbd>⌘</kbd>
          <kbd>↵</kbd>
          <span>to continue</span>
        </span>
        <button
          type="submit"
          className="composer-submit"
          disabled={!prompt.trim() || isLoading}
        >
          Continue
          <span className="composer-submit-icon">{TOOL_ICONS.arrow}</span>
        </button>
      </div>
    </form>
  )
})

/* -------------------------------------------------------------------------
   Template rail
   ------------------------------------------------------------------------- */

function TemplateArt({ art }) {
  if (art === 'bars') {
    return (
      <div className="tpl-art tpl-art--bars">
        <span className="tpl-line w45" />
        <div className="tpl-bars">
          <span style={{ height: '38%' }} />
          <span style={{ height: '64%' }} />
          <span style={{ height: '48%' }} />
          <span style={{ height: '86%' }} />
          <span style={{ height: '72%' }} />
        </div>
      </div>
    )
  }
  if (art === 'split') {
    return (
      <div className="tpl-art tpl-art--split">
        <div className="tpl-split">
          <span className="tpl-block" />
          <span className="tpl-block" />
        </div>
        <span className="tpl-line w60" />
        <span className="tpl-line w35" />
      </div>
    )
  }
  if (art === 'donut') {
    return (
      <div className="tpl-art tpl-art--donut">
        <span className="tpl-donut" />
        <div className="tpl-donut-copy">
          <span className="tpl-line w80" />
          <span className="tpl-line w55" />
          <span className="tpl-line w70" />
        </div>
      </div>
    )
  }
  if (art === 'steps') {
    return (
      <div className="tpl-art tpl-art--steps">
        <span className="tpl-line w50" />
        <span className="tpl-step" />
        <span className="tpl-step" />
        <span className="tpl-step" />
      </div>
    )
  }
  if (art === 'quote') {
    return (
      <div className="tpl-art tpl-art--quote">
        <span className="tpl-quote" aria-hidden>“</span>
        <span className="tpl-line w80" />
        <span className="tpl-line w65" />
      </div>
    )
  }
  return (
    <div className="tpl-art tpl-art--title">
      <span className="tpl-line w80 tall" />
      <span className="tpl-line w55 tall" />
      <span className="tpl-rule" />
      <span className="tpl-line w40" />
    </div>
  )
}

function TemplateRail({ onUse, onBrowseAll }) {
  return (
    <section className="home-section" aria-labelledby="home-templates-title">
      <div className="home-section-head">
        <div className="home-section-copy">
          <span className="home-section-kicker">Shortcuts</span>
          <h2 className="home-section-title" id="home-templates-title">
            Start from a template
          </h2>
          <p className="home-section-sub">
            Proven deck structures, ready for your story. Pick one and make it yours.
          </p>
        </div>
        <button type="button" className="home-link" onClick={() => onBrowseAll?.()}>
          Browse all
          <span className="home-link-arrow" aria-hidden>→</span>
        </button>
      </div>

      <div className="template-rail">
        {TEMPLATES.map((t) => (
          <button
            key={t.name}
            type="button"
            className="template-card"
            onClick={() => onUse?.(t)}
            aria-label={`Use the ${t.name} template`}
          >
            <span className={`template-cover tag-${t.tag.toLowerCase()}`}>
              <span className="template-cover-head">
                <span className="template-slide-no">01</span>
                <span className="template-tag">{t.tag}</span>
              </span>
              <span className="template-art-wrap" aria-hidden>
                <TemplateArt art={t.art} />
              </span>
              <span className="template-use" aria-hidden>
                Use template <span>→</span>
              </span>
            </span>
            <span className="template-meta">
              <span className="template-name">{t.name}</span>
              <span className="template-hint">6–10 slides</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------
   Recent decks
   ------------------------------------------------------------------------- */

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = (Date.now() - then) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function DeckTile({ deck, onOpen, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef(null)
  const theme = deck.theme || {}
  const bg =
    theme.background ||
    `linear-gradient(135deg, ${theme.primary || '#7c5cff'}, ${theme.accent || '#ff6ea0'})`
  const accent = theme.accent || theme.primary || '#7c5cff'

  useEffect(() => {
    if (isRenaming) renameRef.current?.select()
  }, [isRenaming])

  function startRename() {
    setRenameValue(deck.title || '')
    setIsRenaming(true)
    setMenuOpen(false)
  }

  function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== deck.title) onRename?.(deck.id, trimmed)
    setIsRenaming(false)
  }

  return (
    <article className="deck-card home-deck-card">
      <button
        type="button"
        className="deck-thumb"
        style={{ background: bg }}
        onClick={() => onOpen(deck.id)}
        aria-label={`Open ${deck.title}`}
      >
        <div className="deck-thumb-inner" style={{ color: theme.fg || '#ffffff' }}>
          <div className="deck-eyebrow" style={{ color: accent }}>
            {theme.name || 'Deck'}
          </div>
          <div className="deck-headline">{deck.title}</div>
          {deck.subtitle ? <div className="deck-subline">{deck.subtitle}</div> : null}
        </div>
        <div className="deck-pill">{deck.slideCount} cards</div>
      </button>

      <div className="deck-meta">
        <div className="deck-title-row">
          {isRenaming ? (
            <input
              ref={renameRef}
              className="deck-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') setIsRenaming(false)
              }}
              maxLength={120}
              aria-label="Rename deck"
            />
          ) : (
            <span className="deck-title">{deck.title}</span>
          )}
          <div className="deck-menu-wrap">
            <button
              type="button"
              className="deck-more"
              aria-label="More options"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="deck-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onOpen(deck.id) }}>Open</button>
                <button onClick={startRename}>Rename</button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false)
                    if (window.confirm(`Delete "${deck.title}"? This can't be undone.`)) {
                      onDelete(deck.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <span className="deck-edited">Edited {timeAgo(deck.updatedAt)}</span>
      </div>
    </article>
  )
}

function RecentDecks({
  decks = [],
  totalCount = 0,
  query = '',
  onOpen,
  onDelete,
  onRename,
  onBrowseAll,
  onStart,
}) {
  const isFiltering = query.trim().length > 0
  const isEmpty = decks.length === 0

  return (
    <section className="home-section" aria-labelledby="home-recent-title">
      <div className="home-section-head">
        <div className="home-section-copy">
          <span className="home-section-kicker">Library</span>
          <h2 className="home-section-title" id="home-recent-title">
            {isFiltering ? `Results for “${query.trim()}”` : 'Pick up where you left off'}
          </h2>
          <p className="home-section-sub">
            {isFiltering
              ? `${decks.length} of ${totalCount} deck${totalCount === 1 ? '' : 's'} match your search.`
              : totalCount > 0
                ? `Your last ${decks.length} deck${decks.length === 1 ? '' : 's'}, ready to open and edit.`
                : 'Every deck you create shows up here, ready to reopen.'}
          </p>
        </div>
        {!isEmpty ? (
          <button type="button" className="home-link" onClick={() => onBrowseAll?.()}>
            View all
            <span className="home-link-arrow" aria-hidden>→</span>
          </button>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="home-empty">
          <div className="empty-stack" aria-hidden>
            <span className="empty-sheet empty-sheet--back" />
            <span className="empty-sheet empty-sheet--mid" />
            <span className="empty-sheet empty-sheet--front">
              <span className="empty-sheet-eyebrow" />
              <span className="empty-sheet-line w70" />
              <span className="empty-sheet-line w45" />
              <span className="empty-sheet-block" />
            </span>
          </div>
          <div className="home-empty-copy">
            <h3 className="home-empty-title">
              {isFiltering ? 'No decks match that search' : 'Your first deck is one sentence away'}
            </h3>
            <p className="home-empty-sub">
              {isFiltering
                ? 'Try another keyword, or clear the search in the top bar to see your whole library.'
                : 'Describe an idea above and SlideAI writes the story, designs each slide, and saves it here automatically.'}
            </p>
            {!isFiltering ? (
              <button type="button" className="home-empty-cta" onClick={() => onStart?.()}>
                <span className="home-empty-cta-icon">{TOOL_ICONS.spark}</span>
                Start writing a prompt
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="deck-grid home-deck-grid">
          {decks.map((d) => (
            <DeckTile
              key={d.id}
              deck={d}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------- */

const HomePage = forwardRef(function HomePage(
  {
    status = 'idle',
    error = '',
    decks = [],
    totalCount = 0,
    query = '',
    onContinue,
    onOpen,
    onDelete,
    onRename,
    onBrowseTemplates,
    onBrowseDecks,
  },
  ref,
) {
  const composerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focusPrompt() {
      composerRef.current?.focusPrompt()
    },
    applyPrompt(text) {
      composerRef.current?.applyPrompt(text)
    },
    applyTemplate(name) {
      const template = TEMPLATES.find((t) => t.name === name)
      if (template) composerRef.current?.applyPrompt(template.prompt)
    },
  }))

  return (
    <div className="home">
      <section className="home-hero" id="create-hero">
        <div className="home-copy">
          <span className="home-eyebrow">
            <span className="home-eyebrow-dot" aria-hidden />
            AI deck studio
          </span>
          <h1 className="home-title">
            Your idea,
            <br />
            made <em>slide-ready.</em>
          </h1>
          <p className="home-lede">
            Describe what you need to present. SlideAI shapes the story, designs every
            slide, and hands you a polished deck you can edit in seconds.
          </p>
          <ul className="home-proof" aria-label="What you get">
            <li><span aria-hidden>◆</span> 60-second first draft</li>
            <li><span aria-hidden>◆</span> AI-designed layouts</li>
            <li><span aria-hidden>◆</span> Fully editable</li>
          </ul>
        </div>

        <div className="home-panel">
          <Composer
            ref={composerRef}
            onContinue={onContinue}
            status={status}
            error={error}
          />
        </div>

        <div className="home-starters">
          <div className="home-starters-label">
            <span className="home-starters-line" aria-hidden />
            Need a spark?
          </div>
          <div className="home-starter-list">
            {STARTERS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="home-starter"
                onClick={() => composerRef.current?.applyPrompt(s.prompt)}
              >
                <span className="home-starter-name">{s.label}</span>
                <span className="home-starter-hint">{s.hint}</span>
                <span className="home-starter-arrow" aria-hidden>↗</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <TemplateRail
        onUse={(template) => composerRef.current?.applyPrompt(template.prompt)}
        onBrowseAll={onBrowseTemplates}
      />

      <RecentDecks
        decks={decks}
        totalCount={totalCount}
        query={query}
        onOpen={onOpen}
        onDelete={onDelete}
        onRename={onRename}
        onBrowseAll={onBrowseDecks}
        onStart={() => composerRef.current?.focusPrompt()}
      />
    </div>
  )
})

export default HomePage
