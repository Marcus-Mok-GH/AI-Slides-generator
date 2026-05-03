import { useCallback, useEffect, useRef, useState } from 'react'
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

/* ─────────────────────── Tool chip ─────────────────────────────── */

function ToolChip({ tool, status }) {
  const label = TOOL_LABEL[tool] || tool
  const cls = [
    'af-chip',
    status === 'running' ? 'af-chip-running' : '',
    status === 'done' ? 'af-chip-done' : '',
    status === 'failed' ? 'af-chip-error' : '',
  ].filter(Boolean).join(' ')
  const icon = status === 'running' ? <span className="af-chip-spinner" /> : status === 'done' ? '✓' : '✗'
  return <span className={cls}>{icon} {label}</span>
}

/* ─────────────────────── Result renderers ───────────────────────── */

function SlideResult({ slide }) {
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
  return (
    <div className="af-image">
      <img src={result.url} alt={result.prompt} />
      <div className="af-image-caption">{result.prompt}</div>
    </div>
  )
}

function SearchResult({ result }) {
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

/* ─────────────────────── Step progress tracker ─────────────────── */

function StepTrack({ steps }) {
  if (!steps.length) return null
  return (
    <div className="af-step-track">
      {steps.map((s, i) => (
        <div key={s.id} className={`af-step-row af-step-${s.status}`}>
          <div className="af-step-num">{i + 1}</div>
          <div className="af-step-icon">{TOOL_ICON[s.tool] || '🔧'}</div>
          <div className="af-step-info">
            <div className="af-step-label">{TOOL_LABEL[s.tool] || s.tool}</div>
            {toolArgSummary(s.tool, s.args) ? (
              <div className="af-step-arg">{toolArgSummary(s.tool, s.args)}</div>
            ) : null}
          </div>
          <div className="af-step-badge">
            {s.status === 'running' ? (
              <span className="af-step-spinner" />
            ) : s.status === 'done' ? (
              <span className="af-step-check">✓</span>
            ) : (
              <span className="af-step-fail">✗</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────── Current tool panel ─────────────────────── */

function CurrentToolPanel({ currentTool }) {
  if (!currentTool) {
    return (
      <div className="af-tool-panel af-tool-panel-empty">
        <div className="af-tool-panel-empty-icon">⚡</div>
        <div className="af-tool-panel-empty-text">
          Tool activity appears here as Agent Five works.
        </div>
      </div>
    )
  }

  const { tool, status, result, error, args } = currentTool
  const label = TOOL_LABEL[tool] || tool
  const icon = TOOL_ICON[tool] || '🔧'

  const argSummary = tool === 'web_search'
    ? args?.query
    : tool === 'create_presentation_slide'
    ? args?.title
    : tool === 'create_image'
    ? args?.prompt
    : null

  return (
    <div className={`af-tool-panel af-tool-panel-${status}`}>
      <div className="af-tool-panel-header">
        <div className="af-tool-panel-icon">{icon}</div>
        <div className="af-tool-panel-meta">
          <div className="af-tool-panel-name">{label}</div>
          {argSummary ? (
            <div className="af-tool-panel-arg">{argSummary}</div>
          ) : null}
        </div>
        <div className="af-tool-panel-status">
          {status === 'running' ? (
            <span className="af-tool-panel-spinner" />
          ) : status === 'done' ? (
            <span className="af-tool-panel-done">✓</span>
          ) : (
            <span className="af-tool-panel-fail">✗</span>
          )}
        </div>
      </div>

      <div className="af-tool-panel-body">
        {status === 'running' ? (
          <div className="af-tool-panel-loading">
            <div className="af-tool-panel-bar" />
            <div className="af-tool-panel-loading-label">
              {tool === 'web_search' ? 'Searching the web…'
                : tool === 'create_image' ? 'Generating image…'
                : tool === 'create_presentation_slide' ? 'Creating slide…'
                : 'Working…'}
            </div>
          </div>
        ) : status === 'failed' ? (
          <div className="af-tool-panel-error">{error || 'Tool failed'}</div>
        ) : result ? (
          <div className="af-tool-panel-result">
            {tool === 'create_presentation_slide' ? (
              <SlideResult slide={result} />
            ) : tool === 'create_image' ? (
              <ImageResult result={result} />
            ) : tool === 'web_search' ? (
              <SearchResult result={result} />
            ) : (
              <pre className="af-tool-panel-json">{JSON.stringify(result, null, 2)}</pre>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ─────────────────────── Pending message ────────────────────────── */

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
            <span className="af-dot" /><span className="af-dot" /><span className="af-dot" />
          </div>
        )}
        {tools.length > 0 ? (
          <div className="af-msg-tools">
            {tools.map((t) => <ToolChip key={t.id} tool={t.tool} status={t.status} />)}
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
      <div className="af-msg-avatar">{m.role === 'assistant' ? '5' : 'You'}</div>
      <div className="af-msg-bubble">
        <div className="af-msg-text">{m.content}</div>
        {m.toolSummary?.length ? (
          <div className="af-msg-tools">
            {m.toolSummary.map((t, i) => (
              <ToolChip key={i} tool={t.tool} status={t.ok ? 'done' : 'failed'} />
            ))}
          </div>
        ) : null}
        {m.needsClarification ? <div className="af-msg-meta">Needs your input ↓</div> : null}
      </div>
    </div>
  )
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

const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi, I'm Agent Five. Tell me what to build — I'll get to work right away. I can search the web, generate images, and create slides, all autonomously.",
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
  const [stepLog, setStepLog] = useState([])
  const [showChatDrawer, setShowChatDrawer] = useState(false)
  const scrollerRef = useRef(null)
  const drawerPanelRef = useRef(null)
  const dragStartX = useRef(0)
  const dragDeltaX = useRef(0)

  function handleDrawerTouchStart(e) {
    dragStartX.current = e.touches[0].clientX
    dragDeltaX.current = 0
    if (drawerPanelRef.current) {
      drawerPanelRef.current.style.transition = 'none'
    }
  }

  function handleDrawerTouchMove(e) {
    const delta = e.touches[0].clientX - dragStartX.current
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
    navigate('/agentfive')
    setActiveChatId(null)
    setMessages([WELCOME_MSG])
    setCurrentTool(null)
    setStepLog([])
    setError('')
  }

  function handleSelectChat(id) {
    navigate(`/agentfive/${encodeURIComponent(id)}`)
  }

  async function handleDeleteChat(id) {
    try {
      await deleteAgentChat(id)
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (id === activeChatId) handleNewChat()
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

    const userMsg = { id: uid(), role: 'user', content: message }
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

    try {
      await streamAgentFive({ history, message }, {
        onReplyDelta({ text, iteration, needsClarification }) {
          setPending((prev) => {
            if (!prev) return prev
            const sep = prev.reply && iteration > 0 ? '\n\n' : ''
            return { ...prev, reply: prev.reply + sep + text, needsClarification: !!needsClarification }
          })
        },
        onToolStart({ id, tool, args }) {
          setPending((prev) => {
            if (!prev) return prev
            return { ...prev, tools: { ...prev.tools, [id]: { id, tool, args, status: 'running' } } }
          })
          setCurrentTool({ id, tool, args, status: 'running' })
          setStepLog((prev) => [...prev, { id, tool, args, status: 'running' }])
        },
        onToolResult(result) {
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
          setCurrentTool((prev) => {
            if (!prev || prev.id !== result.id) return prev
            return {
              ...prev,
              status: result.ok ? 'done' : 'failed',
              result: result.ok ? result.result : undefined,
              error: result.ok ? undefined : result.error,
            }
          })
          setStepLog((prev) =>
            prev.map((s) =>
              s.id === result.id ? { ...s, status: result.ok ? 'done' : 'failed' } : s,
            ),
          )
        },
        onDone() {
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

  return (
    <div className={`af-layout${currentTool?.status === 'running' ? ' af-tool-active' : ''}`}>
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
              {messages.map((m) => <CompletedMessage key={m.id} m={m} />)}
              {pending ? <PendingMessage pending={pending} /> : null}
              {error ? <div className="af-error">{error}</div> : null}
            </div>
          )}

          {messages.length <= 1 && !busy && !chatLoading ? (
            <div className="af-starters">
              {STARTER_PROMPTS.map((p, i) => (
                <button key={i} type="button" className="af-starter" onClick={() => send(p)} disabled={busy}>
                  {p}
                </button>
              ))}
            </div>
          ) : null}

          <form className="af-composer" onSubmit={(e) => { e.preventDefault(); send() }}>
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

        <aside className="af-panel-col">
          <div className="af-panel-head">
            <div className="af-panel-title">
              {stepLog.length > 0
                ? `Step ${stepLog.length}`
                : 'Agent workspace'}
            </div>
            <div className="af-panel-sub">
              {currentTool && currentTool.status === 'running'
                ? toolRunningLabel(currentTool.tool, currentTool.args)
                : currentTool && currentTool.status === 'done'
                ? 'Step complete'
                : currentTool && currentTool.status === 'failed'
                ? 'Step failed'
                : 'Tool activity appears here as Agent Five works'}
            </div>
          </div>
          {stepLog.length > 0 ? (
            <div className="af-panel-steps">
              <StepTrack steps={stepLog} />
            </div>
          ) : null}
          <div className="af-panel-body">
            <CurrentToolPanel currentTool={currentTool} />
          </div>
        </aside>
      </div>
    </div>
  )
}
