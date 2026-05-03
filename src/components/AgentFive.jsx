import { Component, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  streamAgentFive,
  listAgentChats,
  createAgentChat,
  getAgentChat,
  updateAgentChat,
  deleteAgentChat,
} from '../lib/api.js'
import logo from '../assets/slideai-logo.svg'
import './AgentFive.css'

/* ─────────────────────── Error boundary ────────────────────────── */

class AgentFiveBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false, error: null } }
  static getDerivedStateFromError(err) { return { crashed: true, error: err } }
  componentDidCatch(err, info) { console.error('[AgentFive] render error', err, info) }
  render() {
    if (this.state.crashed) {
      return (
        <div className="af-layout af-crash-screen">
          <div className="af-crash-inner">
            <div className="af-crash-icon">⚠</div>
            <div className="af-crash-title">Something went wrong</div>
            <div className="af-crash-msg">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </div>
            <button
              type="button"
              className="af-btn af-btn-primary"
              style={{ marginTop: 20 }}
              onClick={() => this.setState({ crashed: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ─────────────────────── Code block with copy ───────────────────── */

function CodeBlock({ children }) {
  const preRef = useRef(null)
  const [copied, setCopied] = useState(null)   // null | 'all' | 'selection'
  const [hasSel, setHasSel] = useState(false)

  useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection()
      if (!sel || !preRef.current || sel.rangeCount === 0 || !sel.toString().trim()) {
        setHasSel(false); return
      }
      try {
        setHasSel(sel.getRangeAt(0).intersectsNode(preRef.current))
      } catch { setHasSel(false) }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  const lang = (() => {
    const kids = Array.isArray(children) ? children : [children]
    for (const c of kids) {
      const cn = c?.props?.className || ''
      const m = cn.match(/language-(\w+)/)
      if (m) return m[1]
    }
    return ''
  })()

  function handleCopy() {
    const sel = window.getSelection()
    let text = ''
    let mode = 'all'

    if (sel && sel.toString().trim() && sel.rangeCount > 0 && preRef.current) {
      try {
        if (sel.getRangeAt(0).intersectsNode(preRef.current)) {
          text = sel.toString(); mode = 'selection'
        }
      } catch {}
    }
    if (!text) { text = preRef.current?.textContent || ''; mode = 'all' }

    const write = navigator.clipboard?.writeText(text) ?? Promise.reject()
    write.catch(() => {
      const ta = Object.assign(document.createElement('textarea'), { value: text })
      Object.assign(ta.style, { position: 'fixed', opacity: '0' })
      document.body.appendChild(ta); ta.select(); document.execCommand('copy')
      document.body.removeChild(ta)
    })
    setCopied(mode)
    setTimeout(() => setCopied(null), 2200)
  }

  const btnLabel = copied
    ? (copied === 'selection' ? '✓ Selection' : '✓ Copied')
    : hasSel ? 'Copy selection' : 'Copy all'

  return (
    <div className="af-code-block">
      <div className="af-code-header" onMouseDown={(e) => e.preventDefault()}>
        <span className="af-code-lang">{lang}</span>
        <button
          type="button"
          className={[
            'af-code-copy',
            hasSel  && !copied ? 'af-code-copy-sel'  : '',
            copied             ? 'af-code-copy-done' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleCopy}
          title={hasSel ? 'Copy selected text' : 'Copy entire code block'}
        >
          {btnLabel}
        </button>
      </div>
      <pre className="af-md-pre af-md-pre-inblock" ref={preRef}>
        {children}
      </pre>
    </div>
  )
}

/* ─────────────────────── Markdown renderer ──────────────────────── */

const MD_COMPONENTS = {
  a:   ({ node, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
  pre: ({ node, children }) => <CodeBlock>{children}</CodeBlock>,
  code({ node, className, children, ...p }) {
    return className
      ? <code className={`af-md-code-block ${className}`} {...p}>{children}</code>
      : <code className="af-md-code-inline" {...p}>{children}</code>
  },
  blockquote: ({ node, ...p }) => <blockquote className="af-md-blockquote" {...p} />,
  table:  ({ node, ...p }) => <div className="af-md-table-wrap"><table className="af-md-table" {...p} /></div>,
  input:  ({ node, ...p }) => <input className="af-md-checkbox" {...p} />,
}

function MarkdownContent({ content, streaming }) {
  const safe = typeof content === 'string' ? content : String(content ?? '')
  return (
    <div className={`af-msg-text af-md${streaming ? ' af-msg-streaming' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {safe}
      </ReactMarkdown>
    </div>
  )
}

const STARTER_PROMPTS = [
  'Help me build a 5-slide pitch about a coffee subscription startup.',
  'Research recent breakthroughs in fusion energy and draft an intro slide.',
  'Make a slide explaining the difference between RAG and fine-tuning.',
  'Create a hero image for a slide titled "The future of remote work".',
]

const TOOL_LABEL = {
  web_search: 'Web search',
  create_image: 'Generate image',
  create_presentation_slide: 'Create slide',
}

const TOOL_ICON = {
  web_search: '🔍',
  create_image: '🎨',
  create_presentation_slide: '🖼',
}

function toolArgSummary(tool, args) {
  if (tool === 'web_search') return args?.query || ''
  if (tool === 'create_presentation_slide') return args?.title || ''
  if (tool === 'create_image') return args?.prompt || ''
  return ''
}

function toolRunningLabel(tool, args) {
  if (tool === 'web_search') return `Searching for "${args?.query || '…'}"`
  if (tool === 'create_image') return `Generating image…`
  if (tool === 'create_presentation_slide') return `Creating slide "${args?.title || '…'}"`
  return 'Working…'
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

/* ─────────────────────── Result renderers ───────────────────────── */

function SlideResult({ slide }) {
  if (!slide) return null
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
      {(slide.speakerNotes || slide.notes) ? (
        <div className="af-slide-notes">
          <span className="af-slide-notes-label">Notes</span>
          {slide.speakerNotes || slide.notes}
        </div>
      ) : null}
      <div className="af-slide-footer">
        <span className="af-tag">{slide.layout}</span>
      </div>
    </div>
  )
}

function ImageResult({ result }) {
  if (!result?.url) {
    return <div className="af-image-error">Image unavailable</div>
  }
  return (
    <div className="af-image">
      <img src={result.url} alt={result.prompt || ''} onError={(e) => { e.currentTarget.style.display = 'none' }} />
      <div className="af-image-caption">{result.prompt || ''}</div>
    </div>
  )
}

function SearchResult({ result }) {
  const items = Array.isArray(result?.results) ? result.results : []
  return (
    <div className="af-search">
      <div className="af-search-query">Searched: <em>{result?.query || '…'}</em></div>
      <ul className="af-search-results">
        {items.length === 0 ? (
          <li className="af-search-empty">No results.</li>
        ) : items.map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>
            {r.snippet ? <p>{r.snippet}</p> : null}
            <span className="af-search-url">{r.url}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─────────────────────── Pending message ────────────────────────── */

function PendingMessage({ pending }) {
  const tools = Object.values(pending.tools)
  return (
    <div className="af-msg af-msg-assistant">
      <div className="af-msg-avatar">5</div>
      <div className="af-msg-content">
        {tools.length > 0 && (
          <div className="af-inline-steps">
            {tools.map((t) => (
              <div key={t.id} className={`af-inline-step af-inline-step-${t.status}`}>
                <span className="af-inline-step-icon">
                  {t.status === 'running'
                    ? <span className="af-chip-spinner" />
                    : t.status === 'done' ? '✓' : '✗'}
                </span>
                <span className="af-inline-step-text">
                  <span className="af-inline-step-name">{TOOL_LABEL[t.tool] || t.tool}</span>
                  {toolArgSummary(t.tool, t.args) ? (
                    <span className="af-inline-step-arg">{toolArgSummary(t.tool, t.args)}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
        {pending.reply ? (
          <MarkdownContent content={pending.reply} streaming />
        ) : tools.length === 0 ? (
          <div className="af-msg-thinking">
            <span className="af-dot" /><span className="af-dot" /><span className="af-dot" />
          </div>
        ) : null}
        {pending.needsClarification ? (
          <div className="af-msg-meta">Needs your input ↓</div>
        ) : null}
      </div>
    </div>
  )
}

/* ─────────────────────── Swipe-to-reply wrapper ─────────────────── */

function SwipeToReply({ onReply, children }) {
  const wrapRef = useRef(null)
  const iconRef = useRef(null)
  const startX = useRef(0)
  const deltaX = useRef(0)

  function onTouchStart(e) {
    const touch = e.touches?.[0]
    if (!touch) return
    startX.current = touch.clientX
    deltaX.current = 0
    if (wrapRef.current) wrapRef.current.style.transition = 'none'
    if (iconRef.current) iconRef.current.style.transition = 'none'
  }

  function onTouchMove(e) {
    const touch = e.touches?.[0]
    if (!touch) return
    const d = touch.clientX - startX.current
    if (d > 0) {
      deltaX.current = Math.min(d, 72)
      const progress = Math.min(deltaX.current / 52, 1)
      if (wrapRef.current) wrapRef.current.style.transform = `translateX(${deltaX.current}px)`
      if (iconRef.current) {
        iconRef.current.style.opacity = progress
        iconRef.current.style.transform = `scale(${0.55 + progress * 0.45}) translateY(-50%)`
      }
    }
  }

  function onTouchEnd() {
    const spring = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    const fade   = 'opacity 180ms ease, transform 180ms ease'
    if (deltaX.current >= 52) {
      onReply()
      if (wrapRef.current) { wrapRef.current.style.transition = spring; wrapRef.current.style.transform = 'translateX(0)' }
      if (iconRef.current) { iconRef.current.style.transition = fade; iconRef.current.style.opacity = '0'; iconRef.current.style.transform = 'scale(0.55) translateY(-50%)' }
    } else {
      if (wrapRef.current) { wrapRef.current.style.transition = 'transform 200ms cubic-bezier(0.16,1,0.3,1)'; wrapRef.current.style.transform = 'translateX(0)' }
      if (iconRef.current) { iconRef.current.style.transition = fade; iconRef.current.style.opacity = '0' }
    }
    deltaX.current = 0
  }

  return (
    <div className="af-swipe-reply-outer">
      <span className="af-swipe-reply-icon" ref={iconRef} aria-hidden="true" style={{ opacity: 0 }}>↩</span>
      <div
        ref={wrapRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}

/* ─────────────────────── Completed message ──────────────────────── */

function CompletedMessage({ m, onReply }) {
  const toolResults = (m.toolSummary ?? []).filter((t) => t.result)

  const inner = (
    <div className={`af-msg af-msg-${m.role}`}>
      {m.role === 'assistant' && <div className="af-msg-avatar">5</div>}
      {m.role === 'assistant' ? (
        <div className="af-msg-content">
          {toolResults.length > 0 && (
            <div className="af-inline-results">
              {toolResults.map((t, i) => (
                <div key={i} className={`af-inline-result ${t.ok ? 'af-inline-result-ok' : 'af-inline-result-fail'}`}>
                  <div className="af-inline-result-header">
                    <span className="af-inline-result-icon">{TOOL_ICON[t.tool] || '🔧'}</span>
                    <span className="af-inline-result-name">{TOOL_LABEL[t.tool] || t.tool}</span>
                    {toolArgSummary(t.tool, t.args) ? (
                      <span className="af-inline-result-arg">{toolArgSummary(t.tool, t.args)}</span>
                    ) : null}
                    <span className={`af-inline-result-badge ${t.ok ? 'af-inline-result-badge-ok' : 'af-inline-result-badge-fail'}`}>
                      {t.ok ? '✓' : '✗'}
                    </span>
                  </div>
                  {t.ok && t.result && (
                    <div className="af-inline-result-body">
                      {t.tool === 'create_presentation_slide' ? <SlideResult slide={t.result} />
                       : t.tool === 'create_image' ? <ImageResult result={t.result} />
                       : t.tool === 'web_search' ? <SearchResult result={t.result} />
                       : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <MarkdownContent content={m.content} />
          {m.needsClarification ? <div className="af-msg-meta">Needs your input ↓</div> : null}
        </div>
      ) : (
        <div className="af-msg-bubble">
          <MarkdownContent content={m.content} />
        </div>
      )}
    </div>
  )
  if (!onReply || m.id === 'welcome') return inner
  return <SwipeToReply onReply={onReply}>{inner}</SwipeToReply>
}

/* ─────────────────────── Chat sidebar ───────────────────────────── */

function ChatSidebar({ chats, activeChatId, onNew, onSelect, onDelete }) {
  return (
    <aside className="af-chat-sidebar">
      <div className="af-sidebar-head">
        <button type="button" className="af-sidebar-new" onClick={onNew}>
          <span className="af-sidebar-new-icon">+</span>
          New chat
        </button>
      </div>
      <div className="af-sidebar-list">
        {chats.length === 0 ? (
          <div className="af-sidebar-empty">No chats yet</div>
        ) : chats.map((c) => (
          <div
            key={c.id}
            className={`af-sidebar-item${c.id === activeChatId ? ' af-sidebar-item-active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="af-sidebar-item-title">{c.title || 'Untitled'}</div>
            <button
              type="button"
              className="af-sidebar-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
              title="Delete chat"
            >✕</button>
          </div>
        ))}
      </div>
    </aside>
  )
}

/* ─────────────────────────── Main component ────────────────────── */

const WELCOME_MSG = { id: 'welcome', role: 'assistant', content: '' }

function WelcomeScreen({ onPrompt, busy }) {
  return (
    <div className="af-welcome">
      <div className="af-welcome-orb">5</div>
      <h1 className="af-welcome-heading">What would you like to create?</h1>
      <p className="af-welcome-sub">
        I can research topics on the web, design individual slides, generate images, and build full presentation decks — all through one conversation.
      </p>
      <div className="af-starters">
        {STARTER_PROMPTS.map((p, i) => (
          <button key={i} type="button" className="af-starter" onClick={() => onPrompt(p)} disabled={busy}>
            <span className="af-starter-arrow">→</span>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AgentFive({ chatId: propChatId }) {
  const [messages, setMessages] = useState([WELCOME_MSG])
  const [activeChatId, setActiveChatId] = useState(propChatId || null)
  const [chats, setChats] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const [currentTool, setCurrentTool] = useState(null)
  const [showChatDrawer, setShowChatDrawer] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const scrollerRef = useRef(null)
  const drawerPanelRef = useRef(null)
  const dragStartX = useRef(0)
  const dragDeltaX = useRef(0)
  const watchdogRef = useRef(null)

  function handleDrawerTouchStart(e) {
    const touch = e.touches?.[0]
    if (!touch) return
    dragStartX.current = touch.clientX
    dragDeltaX.current = 0
    if (drawerPanelRef.current) {
      drawerPanelRef.current.style.transition = 'none'
    }
  }

  function handleDrawerTouchMove(e) {
    const touch = e.touches?.[0]
    if (!touch) return
    const delta = touch.clientX - dragStartX.current
    if (delta < 0) {
      dragDeltaX.current = delta
      if (drawerPanelRef.current) {
        drawerPanelRef.current.style.transform = `translateX(${delta}px)`
      }
    }
  }

  function handleDrawerTouchEnd() {
    const panel = drawerPanelRef.current
    if (dragDeltaX.current < -60) {
      if (panel) {
        panel.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 1, 1)'
        panel.style.transform = 'translateX(-110%)'
      }
      setTimeout(() => setShowChatDrawer(false), 200)
    } else {
      if (panel) {
        panel.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)'
        panel.style.transform = 'translateX(0)'
      }
    }
  }

  const refreshChats = useCallback(async () => {
    try {
      const list = await listAgentChats()
      setChats(list)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { refreshChats() }, [refreshChats])
  useEffect(() => () => { clearTimeout(watchdogRef.current) }, [])

  useEffect(() => {
    const newId = propChatId || null
    if (newId === activeChatId) return
    setActiveChatId(newId)
    if (!newId) {
      setMessages([WELCOME_MSG])
      return
    }
    setChatLoading(true)
    getAgentChat(newId).then((chat) => {
      if (chat && Array.isArray(chat.messages) && chat.messages.length > 0) {
        setMessages(chat.messages)
      } else {
        setMessages([WELCOME_MSG])
      }
    }).catch(() => setMessages([WELCOME_MSG]))
      .finally(() => setChatLoading(false))
  }, [propChatId])

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages, pending])

  function handleNewChat() {
    clearTimeout(watchdogRef.current)
    navigate('/agentfive')
    setActiveChatId(null)
    setMessages([WELCOME_MSG])
    setPending(null)
    setBusy(false)
    setCurrentTool(null)
    setError('')
    setReplyTo(null)
  }

  function handleSelectChat(id) {
    navigate(`/agentfive/${encodeURIComponent(id)}`)
  }

  async function handleDeleteChat(id) {
    try {
      await deleteAgentChat(id)
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (id === activeChatId) {
        clearTimeout(watchdogRef.current)
        setPending(null)
        setBusy(false)
        handleNewChat()
      }
    } catch { /* silent */ }
  }

  async function saveChat(chatId, allMessages, title) {
    const storable = allMessages.filter((m) => m.id !== 'welcome')
    try {
      await updateAgentChat(chatId, { title, messages: storable })
      setChats((prev) => prev.map((c) =>
        c.id === chatId ? { ...c, title: title || c.title, updatedAt: new Date() } : c,
      ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
    } catch { /* silent */ }
  }

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setError('')
    setInput('')

    const replyContent = replyTo?.content ?? ''
    const quotePrefix = replyTo
      ? `> "${replyContent.slice(0, 120)}${replyContent.length > 120 ? '…' : ''}"\n\n`
      : ''
    setReplyTo(null)

    const userMsg = { id: uid(), role: 'user', content: quotePrefix + message }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setBusy(true)
    setCurrentTool(null)
    setStepLog([])

    const pendingId = uid()
    setPending({ id: pendingId, reply: '', tools: {}, needsClarification: false })

    const history = nextMessages
      .filter((m) => m.id !== 'welcome')
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }))

    let currentChatId = activeChatId
    const chatTitle = message.slice(0, 60)

    if (!currentChatId) {
      try {
        const newId = await createAgentChat({ title: chatTitle, messages: [] })
        currentChatId = newId
        setActiveChatId(newId)
        navigate(`/agentfive/${encodeURIComponent(newId)}`)
        setChats((prev) => [{ id: newId, title: chatTitle, updatedAt: new Date() }, ...prev])
      } catch { /* proceed without persistence */ }
    }

    // Watchdog: clears stuck pending/busy if stream silently drops
    clearTimeout(watchdogRef.current)
    watchdogRef.current = setTimeout(() => {
      setPending(null)
      setBusy(false)
      setError('Response timed out — please try again.')
    }, 120_000)

    try {
      await streamAgentFive({ history, message }, {
        onReplyDelta({ text, iteration, needsClarification }) {
          setPending((prev) => {
            if (!prev) return prev
            const sep = prev.reply && iteration > 0 ? '\n\n' : ''
            return { ...prev, reply: prev.reply + sep + (text ?? ''), needsClarification: !!needsClarification }
          })
        },
        onToolStart({ id, tool, args }) {
          setPending((prev) => {
            if (!prev) return prev
            return { ...prev, tools: { ...prev.tools, [id]: { id, tool, args, status: 'running' } } }
          })
          setCurrentTool({ id, tool, args, status: 'running' })
        },
        onToolResult(result) {
          setPending((prev) => {
            if (!prev) return prev
            const existing = prev.tools[result?.id] || {}
            return {
              ...prev,
              tools: {
                ...prev.tools,
                [result.id]: { ...existing, status: result.ok ? 'done' : 'failed' },
              },
            }
          })
          setCurrentTool((prev) => {
            if (!prev || prev.id !== result?.id) return prev
            return {
              ...prev,
              status: result.ok ? 'done' : 'failed',
              result: result.ok ? result.result : undefined,
              error: result.ok ? undefined : result.error,
            }
          })
        },
        onDone() {
          clearTimeout(watchdogRef.current)
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
                args: t.args,
                result: t.result,
              })),
            }
            setMessages((msgs) => {
              const updated = [...msgs, finalMsg]
              if (currentChatId) saveChat(currentChatId, updated, chatTitle)
              return updated
            })
            return null
          })
          setBusy(false)
        },
        onError(errMsg) {
          clearTimeout(watchdogRef.current)
          setError(typeof errMsg === 'string' ? errMsg : 'Something went wrong.')
          setPending(null)
          setBusy(false)
        },
      })
    } catch (err) {
      clearTimeout(watchdogRef.current)
      setError(err?.message || 'Something went wrong.')
      setPending(null)
      setBusy(false)
    }
  }

  return (
    <AgentFiveBoundary>
    <div className="af-layout">
      <header className="af-topbar">
        <div className="af-topbar-brand">
          <img src={logo} alt="" />
          <div className="af-topbar-titles">
            <div className="af-topbar-title">Agent Five</div>
            <div className="af-topbar-sub">Autonomous · tool-calling · streamed in real time</div>
          </div>
        </div>
        <div className="af-topbar-mobile-btns">
          <button
            type="button"
            className="af-btn-icon"
            aria-label="Chat history"
            title="Chat history"
            onClick={() => setShowChatDrawer(true)}
          >☰</button>
          <button
            type="button"
            className="af-btn-icon"
            aria-label="New chat"
            title="New chat"
            onClick={handleNewChat}
          >＋</button>
        </div>
        <div className="af-topbar-actions">
          <button
            type="button"
            className="af-btn af-btn-primary"
            onClick={() => navigate('/app')}
          >
            ← Back
          </button>
        </div>
      </header>

      {showChatDrawer && (
        <div className="af-mobile-drawer" role="dialog" aria-label="Chat history">
          <div
            className="af-mobile-drawer-overlay"
            onClick={() => setShowChatDrawer(false)}
          />
          <div
            className="af-mobile-drawer-panel"
            ref={drawerPanelRef}
            onTouchStart={handleDrawerTouchStart}
            onTouchMove={handleDrawerTouchMove}
            onTouchEnd={handleDrawerTouchEnd}
          >
            <div className="af-mobile-drawer-head">
              <span className="af-mobile-drawer-title">Chats</span>
              <button
                type="button"
                className="af-mobile-drawer-close"
                aria-label="Close"
                onClick={() => setShowChatDrawer(false)}
              >✕</button>
            </div>
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              onNew={() => { handleNewChat(); setShowChatDrawer(false) }}
              onSelect={(id) => { handleSelectChat(id); setShowChatDrawer(false) }}
              onDelete={handleDeleteChat}
            />
          </div>
        </div>
      )}

      <div className="af-main">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChatId}
          onNew={handleNewChat}
          onSelect={handleSelectChat}
          onDelete={handleDeleteChat}
        />

        <section className="af-chat">
          {chatLoading ? (
            <div className="af-chat-loading">
              <span className="af-chip-spinner" style={{ width: 18, height: 18 }} />
              Loading chat…
            </div>
          ) : (
            <div className="af-chat-scroller" ref={scrollerRef}>
              {messages.length === 1 && messages[0]?.id === 'welcome' && !busy ? (
                <WelcomeScreen onPrompt={send} busy={busy} />
              ) : (
                <>
                  {messages.filter((m) => m?.id !== 'welcome').filter(Boolean).map((m) => (
                    <CompletedMessage key={m.id ?? Math.random()} m={m} onReply={() => setReplyTo(m)} />
                  ))}
                  {pending ? <PendingMessage pending={pending} /> : null}
                  {error ? <div className="af-error">{error}</div> : null}
                </>
              )}
            </div>
          )}

          <form className="af-composer" onSubmit={(e) => { e.preventDefault(); send() }}>
            {replyTo && (
              <div className="af-reply-preview">
                <div className="af-reply-preview-bar" />
                <div className="af-reply-preview-body">
                  <div className="af-reply-preview-who">
                    {replyTo.role === 'assistant' ? 'Agent Five' : 'You'}
                  </div>
                  <div className="af-reply-preview-text">
                    {replyTo.content.slice(0, 100)}{replyTo.content.length > 100 ? '…' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="af-reply-preview-close"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTo(null)}
                >✕</button>
              </div>
            )}
            <textarea
              className="af-composer-input"
              placeholder="Tell Agent Five what to build…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={2}
              disabled={busy || chatLoading}
            />
            <button type="submit" className="af-btn af-btn-primary" disabled={busy || chatLoading || !input.trim()}>
              {busy ? 'Working…' : 'Send'}
            </button>
          </form>
        </section>

      </div>
    </div>
    </AgentFiveBoundary>
  )
}
