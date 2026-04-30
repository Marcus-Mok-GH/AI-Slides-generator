import { useEffect, useRef, useState } from 'react'
import { streamAgentFive } from '../lib/api.js'
import logo from '../assets/slideai-logo.svg'
import './AgentFive.css'

const STARTER_PROMPTS = [
  'Help me build a 5-slide pitch about a coffee subscription startup.',
  'Research recent breakthroughs in fusion energy and draft an intro slide.',
  'Make a slide explaining the difference between RAG and fine-tuning.',
  'Create a hero image for a slide titled "The future of remote work".',
]

const TOOL_LABEL = {
  web_search: 'Web search',
  create_image: 'Image',
  create_presentation_slide: 'Slide',
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function navigate(path) {
  if (typeof window === 'undefined') return
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/* ─────────────────────── Artifact renderers ─────────────────────── */

function ArtifactSlide({ slide }) {
  return (
    <div className="af-slide">
      {slide.sectionLabel ? <div className="af-slide-eyebrow">{slide.sectionLabel}</div> : null}
      <div className="af-slide-title">{slide.title}</div>
      {slide.body ? <div className="af-slide-body">{slide.body}</div> : null}
      {slide.bullets?.length ? (
        <ul className="af-slide-bullets">
          {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      ) : null}
      {slide.stats?.length ? (
        <div className="af-slide-stats">
          {slide.stats.map((s, i) => (
            <div className="af-slide-stat" key={i}>
              <div className="af-slide-stat-value">{s.value}</div>
              <div className="af-slide-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {slide.quote ? <blockquote className="af-slide-quote">"{slide.quote}"</blockquote> : null}
      {slide.image?.url ? (
        <img className="af-slide-image" src={slide.image.url} alt="" />
      ) : slide.imagePrompt && !slide.imageError ? (
        <div className="af-slide-image-placeholder">Image: {slide.imagePrompt}</div>
      ) : null}
      {slide.notes ? (
        <div className="af-slide-notes">
          <span className="af-slide-notes-label">Notes</span>
          {slide.notes}
        </div>
      ) : null}
      <div className="af-slide-footer">
        <span className="af-tag">{slide.layout}</span>
      </div>
    </div>
  )
}

function ArtifactImage({ result }) {
  return (
    <div className="af-image">
      <img src={result.url} alt={result.prompt} />
      <div className="af-image-caption">{result.prompt}</div>
    </div>
  )
}

function ArtifactSearch({ result }) {
  return (
    <div className="af-search">
      <div className="af-search-query">Searched: <em>{result.query}</em></div>
      <ul className="af-search-results">
        {result.results.length === 0 ? (
          <li className="af-search-empty">No results.</li>
        ) : result.results.map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
            {r.snippet ? <p>{r.snippet}</p> : null}
            <span className="af-search-url">{r.url}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Artifact({ artifact }) {
  if (!artifact.ok) {
    return (
      <div className="af-artifact af-artifact-error">
        <div className="af-artifact-head">
          <span className="af-tag af-tag-error">{TOOL_LABEL[artifact.tool] || artifact.tool}</span>
          <span className="af-artifact-status">Failed</span>
        </div>
        <div className="af-artifact-body">{artifact.error}</div>
      </div>
    )
  }
  return (
    <div className="af-artifact">
      <div className="af-artifact-head">
        <span className="af-tag">{TOOL_LABEL[artifact.tool] || artifact.tool}</span>
      </div>
      <div className="af-artifact-body">
        {artifact.tool === 'create_presentation_slide' ? (
          <ArtifactSlide slide={artifact.result} />
        ) : artifact.tool === 'create_image' ? (
          <ArtifactImage result={artifact.result} />
        ) : artifact.tool === 'web_search' ? (
          <ArtifactSearch result={artifact.result} />
        ) : (
          <pre>{JSON.stringify(artifact.result, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────── Tool chip ─────────────────────────────── */

function ToolChip({ tool, status }) {
  const label = TOOL_LABEL[tool] || tool
  const cls = [
    'af-chip',
    status === 'running' ? 'af-chip-running' : '',
    status === 'failed' ? 'af-chip-error' : '',
    status === 'done' ? 'af-chip-done' : '',
  ].filter(Boolean).join(' ')

  const icon = status === 'running' ? '⏳' : status === 'done' ? '✓' : '✗'
  return (
    <span className={cls}>
      {status === 'running' ? <span className="af-chip-spinner" /> : icon} {label}
    </span>
  )
}

/* ─────────────────────── Pending message (streaming) ────────────── */

function PendingMessage({ pending }) {
  const tools = Object.values(pending.tools)
  return (
    <div className="af-msg af-msg-assistant">
      <div className="af-msg-avatar">5</div>
      <div className="af-msg-bubble">
        {pending.reply ? (
          <div className="af-msg-text af-msg-streaming">{pending.reply}</div>
        ) : (
          <div className="af-msg-thinking">
            <span className="af-dot" />
            <span className="af-dot" />
            <span className="af-dot" />
          </div>
        )}
        {tools.length > 0 ? (
          <div className="af-msg-tools">
            {tools.map((t) => (
              <ToolChip key={t.id} tool={t.tool} status={t.status} />
            ))}
          </div>
        ) : null}
        {pending.needsClarification ? (
          <div className="af-msg-meta">Needs your input ↓</div>
        ) : null}
      </div>
    </div>
  )
}

/* ─────────────────────── Completed message ──────────────────────── */

function CompletedMessage({ m }) {
  return (
    <div className={`af-msg af-msg-${m.role}`}>
      <div className="af-msg-avatar">
        {m.role === 'assistant' ? '5' : 'You'}
      </div>
      <div className="af-msg-bubble">
        <div className="af-msg-text">{m.content}</div>
        {m.toolSummary?.length ? (
          <div className="af-msg-tools">
            {m.toolSummary.map((t, i) => (
              <ToolChip key={i} tool={t.tool} status={t.ok ? 'done' : 'failed'} />
            ))}
          </div>
        ) : null}
        {m.needsClarification ? (
          <div className="af-msg-meta">Needs your input ↓</div>
        ) : null}
      </div>
    </div>
  )
}

/* ─────────────────────────── Main component ────────────────────── */

export default function AgentFive() {
  const [messages, setMessages] = useState([
    {
      id: uid(),
      role: 'assistant',
      content:
        "Hi, I'm Agent Five. Tell me what to build — I'll get to work right away. I can search the web, generate images, and create slides, all autonomously.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [artifacts, setArtifacts] = useState([])
  const [pending, setPending] = useState(null)
  const scrollerRef = useRef(null)

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages, pending, artifacts])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setError('')
    setInput('')

    const userMsg = { id: uid(), role: 'user', content: message }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setBusy(true)

    const pendingId = uid()
    setPending({ id: pendingId, reply: '', tools: {}, needsClarification: false })

    const history = nextMessages
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }))

    // Collect tool results so we can build the final message summary
    const collectedTools = []

    try {
      await streamAgentFive({ history, message }, {
        onReplyDelta({ text, iteration, needsClarification }) {
          setPending((prev) => {
            if (!prev) return prev
            const sep = prev.reply && iteration > 0 ? '\n\n' : ''
            return {
              ...prev,
              reply: prev.reply + sep + text,
              needsClarification: !!needsClarification,
            }
          })
        },
        onToolStart({ id, tool, args }) {
          setPending((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              tools: { ...prev.tools, [id]: { id, tool, args, status: 'running' } },
            }
          })
        },
        onToolResult(result) {
          collectedTools.push(result)

          // Update chip status
          setPending((prev) => {
            if (!prev) return prev
            const existing = prev.tools[result.id] || {}
            return {
              ...prev,
              tools: {
                ...prev.tools,
                [result.id]: { ...existing, status: result.ok ? 'done' : 'failed' },
              },
            }
          })

          // Immediately add to workspace artifacts
          if (result.ok) {
            setArtifacts((prev) => [
              ...prev,
              { ...result, id: result.id || uid(), createdAt: Date.now() },
            ])
          }
        },
        onDone() {
          // Finalize the pending message
          setPending((prev) => {
            if (!prev) return prev
            const finalMsg = {
              id: prev.id,
              role: 'assistant',
              content: prev.reply || 'Done.',
              needsClarification: prev.needsClarification,
              toolSummary: Object.values(prev.tools).map((t) => ({
                tool: t.tool,
                ok: t.status === 'done',
              })),
            }
            setMessages((msgs) => [...msgs, finalMsg])
            return null
          })
          setBusy(false)
        },
        onError(errMsg) {
          setError(errMsg)
          setPending(null)
          setBusy(false)
        },
      })
    } catch (err) {
      setError(err?.message || 'Something went wrong.')
      setPending(null)
      setBusy(false)
    }
  }

  function clearWorkspace() { setArtifacts([]) }

  return (
    <div className="af-layout">
      <header className="af-topbar">
        <div className="af-topbar-brand">
          <img src={logo} alt="" />
          <div className="af-topbar-titles">
            <div className="af-topbar-title">Agent Five</div>
            <div className="af-topbar-sub">
              Autonomous · tool-calling · streamed in real time
            </div>
          </div>
        </div>
        <div className="af-topbar-actions">
          <button
            type="button"
            className="af-btn af-btn-ghost"
            onClick={clearWorkspace}
            disabled={artifacts.length === 0}
          >
            Clear workspace
          </button>
          <button
            type="button"
            className="af-btn af-btn-primary"
            onClick={() => navigate('/app')}
          >
            ← Back to Slides
          </button>
        </div>
      </header>

      <div className="af-main">
        <section className="af-chat">
          <div className="af-chat-scroller" ref={scrollerRef}>
            {messages.map((m) => (
              <CompletedMessage key={m.id} m={m} />
            ))}
            {pending ? <PendingMessage pending={pending} /> : null}
            {error ? <div className="af-error">{error}</div> : null}
          </div>

          {messages.length <= 1 && !busy ? (
            <div className="af-starters">
              {STARTER_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className="af-starter"
                  onClick={() => send(p)}
                  disabled={busy}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="af-composer"
            onSubmit={(e) => { e.preventDefault(); send() }}
          >
            <textarea
              className="af-composer-input"
              placeholder="Tell Agent Five what to build…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              rows={2}
              disabled={busy}
            />
            <button
              type="submit"
              className="af-btn af-btn-primary"
              disabled={busy || !input.trim()}
            >
              {busy ? 'Working…' : 'Send'}
            </button>
          </form>
        </section>

        <aside className="af-workspace">
          <div className="af-workspace-head">
            <div className="af-workspace-title">Workspace</div>
            <div className="af-workspace-sub">
              {artifacts.length === 0
                ? 'Slides, images, and search results pin here in real time.'
                : `${artifacts.length} item${artifacts.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="af-workspace-body">
            {artifacts.length === 0 ? (
              <div className="af-workspace-empty">
                <div className="af-workspace-empty-emoji">✶</div>
                <div>
                  Artifacts appear here as Agent Five creates them — you don't have to wait for it to finish.
                </div>
              </div>
            ) : (
              [...artifacts].reverse().map((a) => (
                <Artifact key={a.id} artifact={a} />
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
