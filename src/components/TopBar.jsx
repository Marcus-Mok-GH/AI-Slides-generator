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

function userInitials(user) {
  if (!user) return '?'
  const f = user.firstName?.[0] || ''
  const l = user.lastName?.[0] || ''
  const initials = (f + l).toUpperCase()
  if (initials) return initials
  if (user.email) return user.email[0].toUpperCase()
  return 'U'
}

function userDisplayName(user) {
  if (!user) return ''
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  return user.email || 'Signed in'
}

export default function TopBar({
  search = '',
  onSearchChange,
  deckCount = 0,
  isDark,
  onToggleTheme,
  user = null,
  onSignOut,
}) {
  const [openMenu, setOpenMenu] = useState(null) // 'whatsnew' | 'notif' | 'avatar' | null
  const [scrolled, setScrolled] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll shadow
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`} ref={wrapRef}>
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

        <button
          type="button"
          className={`ghost-btn icon-only theme-toggle-topbar`}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Light mode' : 'Dark mode'}
          onClick={onToggleTheme}
        >
          {isDark ? '☀' : '☾'}
        </button>

        <div className="tb-pop-wrap">
          <button
            type="button"
            className="avatar"
            title={userDisplayName(user) || 'Account'}
            onClick={() => toggle('avatar')}
          >
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt=""
                className="avatar-img"
                referrerPolicy="no-referrer"
              />
            ) : (
              userInitials(user)
            )}
          </button>
          {openMenu === 'avatar' && (
            <div className="tb-pop tb-pop-right">
              <div className="tb-pop-user">
                <div className="tb-pop-avatar">
                  {user?.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt=""
                      className="avatar-img"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    userInitials(user)
                  )}
                </div>
                <div>
                  <div className="tb-pop-name">{userDisplayName(user)}</div>
                  {user?.email ? (
                    <div className="tb-pop-email">{user.email}</div>
                  ) : null}
                </div>
              </div>
              <div className="tb-pop-divider" />
              <button
                type="button"
                className="tb-pop-item"
                onClick={() => {
                  setOpenMenu(null)
                  onSignOut?.()
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
