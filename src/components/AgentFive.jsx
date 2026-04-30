import { useEffect, useRef, useState } from 'react'
import { agentFiveChat } from '../lib/api.js'
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

function ArtifactSlide({ slide }) {
  return (
    <div className="af-slide">
      {slide.sectionLabel ? (
        <div className="af-slide-eyebrow">{slide.sectionLabel}</div>
      ) : null}
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
      {slide.quote ? (
        <blockquote className="af-slide-quote">“{slide.quote}”</blockquote>
      ) : null}
      {slide.image?.url ? (
        <img className="af-slide-image" src={slide.image.url} alt="" />
      ) : slide.imagePrompt && !slide.imageError ? (
        <div className="af-slide-image-placeholder">
          Image: {slide.imagePrompt}
        </div>
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
        ) : (
          result.results.map((r, i) => (
            <li key={i}>
              <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
              {r.snippet ? <p>{r.snippet}</p> : null}
              <span className="af-search-url">{r.url}</span>
            </li>
          ))
        )}
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

export default function AgentFive() {
  const [messages, setMessages] = useState([
    {
      id: uid(),
      role: 'assistant',
      content:
        "Hi, I'm Agent Five. Tell me what you want to build and I'll ask a few questions before I touch the workspace. I can search the web, generate images, and draft presentation slides.",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [artifacts, setArtifacts] = useState([])
  const scrollerRef = useRef(null)

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages, busy])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setError('')
    setInput('')

    const userMsg = { id: uid(), role: 'user', content: message }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setBusy(true)

    try {
      // Send only role/content pairs as the chat history.
      const history = nextMessages
        .slice(0, -1) // exclude the just-added user msg; server adds it separately
        .map((m) => ({ role: m.role, content: m.content }))

      const data = await agentFiveChat({ history, message })

      const replyMsg = {
        id: uid(),
        role: 'assistant',
        content: data.reply || 'Done.',
        needsClarification: !!data.needsClarification,
        toolResults: data.toolResults || [],
      }
      setMessages((prev) => [...prev, replyMsg])

      if (data.toolResults?.length) {
        const stamped = data.toolResults.map((t) => ({
          ...t,
          id: t.id || uid(),
          createdAt: Date.now(),
        }))
        setArtifacts((prev) => [...prev, ...stamped])
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function clearWorkspace() {
    setArtifacts([])
  }

  return (
    <div className="af-layout">
      <header className="af-topbar">
        <div className="af-topbar-brand">
          <img src={logo} alt="" />
          <div className="af-topbar-titles">
            <div className="af-topbar-title">Agent Five</div>
            <div className="af-topbar-sub">
              Conversational workspace · clarifies before it builds
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
              <div key={m.id} className={`af-msg af-msg-${m.role}`}>
                <div className="af-msg-avatar">
                  {m.role === 'assistant' ? '5' : 'You'}
                </div>
                <div className="af-msg-bubble">
                  <div className="af-msg-text">{m.content}</div>
                  {m.toolResults?.length ? (
                    <div className="af-msg-tools">
                      {m.toolResults.map((t, i) => (
                        <span
                          key={i}
                          className={`af-chip ${t.ok ? '' : 'af-chip-error'}`}
                          title={t.ok ? '' : t.error}
                        >
                          {TOOL_LABEL[t.tool] || t.tool}
                          {t.ok ? '' : ' · failed'}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.needsClarification ? (
                    <div className="af-msg-meta">Needs your input ↓</div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="af-msg af-msg-assistant">
                <div className="af-msg-avatar">5</div>
                <div className="af-msg-bubble af-msg-thinking">
                  <span className="af-dot" />
                  <span className="af-dot" />
                  <span className="af-dot" />
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="af-error">{error}</div>
            ) : null}
          </div>

          {messages.length <= 1 ? (
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
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <textarea
              className="af-composer-input"
              placeholder="Talk to Agent Five — what should we build today?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              disabled={busy}
            />
            <button
              type="submit"
              className="af-btn af-btn-primary"
              disabled={busy || !input.trim()}
            >
              {busy ? 'Thinking…' : 'Send'}
            </button>
          </form>
        </section>

        <aside className="af-workspace">
          <div className="af-workspace-head">
            <div className="af-workspace-title">Workspace</div>
            <div className="af-workspace-sub">
              {artifacts.length === 0
                ? 'Slides, images, and search results pin here.'
                : `${artifacts.length} item${artifacts.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="af-workspace-body">
            {artifacts.length === 0 ? (
              <div className="af-workspace-empty">
                <div className="af-workspace-empty-emoji">✶</div>
                <div>
                  Once Agent Five gathers enough info, anything it creates
                  will appear here.
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
