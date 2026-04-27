import { useEffect, useRef, useState } from 'react'
import './TopBar.css'

const CHANGELOG = [
  {
    date: 'Apr 26',
    items: [
      'Per-slide AI image generation (Flux schnell)',
      'Bigger slides in viewer with floating nav',
      'Share & export from any deck',
    ],
  },
  {
    date: 'Apr 22',
    items: [
      '10 distinct slide layouts with strict word caps',
      'Streaming deck generation',
    ],
  },
]

export default function TopBar({
  search = '',
  onSearchChange,
  deckCount = 0,
}) {
  const [openMenu, setOpenMenu] = useState(null) // 'whatsnew' | 'notif' | 'avatar' | null
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Close menus on outside click
  useEffect(() => {
    function onDown(e) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ⌘K / Ctrl+K → focus search
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggle(name) {
    setOpenMenu((cur) => (cur === name ? null : name))
  }

  return (
    <header className="topbar" ref={wrapRef}>
      <div className="topbar-brand" aria-hidden>
        <div className="topbar-brand-mark">S</div>
        <span className="topbar-brand-name">Slide<span>AI</span></span>
      </div>

      <div className="search">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search decks, templates, prompts…"
          aria-label="Search"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
        {search ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => onSearchChange?.('')}
          >
            ×
          </button>
        ) : (
          <kbd className="kbd">⌘K</kbd>
        )}
      </div>

      <div className="topbar-actions">
        <div className="tb-pop-wrap">
          <button
            type="button"
            className={`ghost-btn ${openMenu === 'whatsnew' ? 'is-on' : ''}`}
            onClick={() => toggle('whatsnew')}
          >
            What's new
          </button>
          {openMenu === 'whatsnew' && (
            <div className="tb-pop tb-pop-wide">
              <div className="tb-pop-head">What's new</div>
              {CHANGELOG.map((entry) => (
                <div key={entry.date} className="tb-pop-section">
                  <div className="tb-pop-date">{entry.date}</div>
                  <ul>
                    {entry.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tb-pop-wrap">
          <button
            type="button"
            className={`ghost-btn icon-only ${
              openMenu === 'notif' ? 'is-on' : ''
            }`}
            aria-label="Notifications"
            onClick={() => toggle('notif')}
          >
            🔔
            {deckCount > 0 ? (
              <span className="notif-badge" aria-hidden>
                {Math.min(deckCount, 9)}
              </span>
            ) : null}
          </button>
          {openMenu === 'notif' && (
            <div className="tb-pop">
              <div className="tb-pop-head">Notifications</div>
              {deckCount === 0 ? (
                <div className="tb-pop-empty">You're all caught up.</div>
              ) : (
                <ul className="tb-pop-list">
                  <li>
                    <strong>{deckCount}</strong> deck{deckCount === 1 ? '' : 's'}{' '}
                    in your workspace
                  </li>
                  <li>Auto-save is on for every deck you open</li>
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="tb-pop-wrap">
          <button
            type="button"
            className="avatar"
            title="Account"
            onClick={() => toggle('avatar')}
          >
            AS
          </button>
          {openMenu === 'avatar' && (
            <div className="tb-pop tb-pop-right">
              <div className="tb-pop-user">
                <div className="tb-pop-avatar">AS</div>
                <div>
                  <div className="tb-pop-name">Demo user</div>
                  <div className="tb-pop-email">demo@slideai.app</div>
                </div>
              </div>
              <div className="tb-pop-divider" />
              <button
                type="button"
                className="tb-pop-item"
                onClick={() => {
                  setOpenMenu(null)
                  window.alert(
                    'Account settings will land in the next update.',
                  )
                }}
              >
                Account settings
              </button>
              <button
                type="button"
                className="tb-pop-item"
                onClick={() => {
                  setOpenMenu(null)
                  window.alert(
                    'You\'re signed in as the workspace demo user.',
                  )
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
