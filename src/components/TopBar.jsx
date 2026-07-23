import { useEffect, useRef, useState } from 'react'
import './TopBar.css'
import logo from '../assets/slideai-logo.svg'

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

const THEME_ICONS = { light: '☀', dark: '☾', system: '🖥' }
const THEME_NEXT = { light: 'dark', dark: 'system', system: 'light' }
const THEME_LABELS = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System theme',
}

function formatCredits(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null
  // Always show dollars and cents (e.g. $4.50, $0.00) so the value reads
  // unambiguously as money — not a deck count.
  const dollars = Math.max(0, cents) / 100
  return `$${dollars.toFixed(2)}`
}

export default function TopBar({
  search = '',
  onSearchChange,
  themeMode = 'system',
  onCycleTheme,
  user = null,
  onSignOut,
  creditsCents = null,
  deckCostCents = 50,
  drawerOpen = false,
  onToggleDrawer,
}) {
  const [openMenu, setOpenMenu] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 4) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    function onDown(e) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

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

  return (
    <header className={`topbar ${scrolled ? 'scrolled' : ''}`} ref={wrapRef}>
      {onToggleDrawer ? (
        <button
          type="button"
          className={`hamburger ${drawerOpen ? 'is-open' : ''}`}
          aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={drawerOpen}
          aria-controls="primary-nav"
          onClick={onToggleDrawer}
        >
          <span className="hamburger-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      ) : null}
      <div className="topbar-brand" aria-hidden>
        <img src={logo} alt="" className="topbar-brand-logo" />
      </div>

      <div className="search">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search decks…"
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
        {(() => {
          const label = formatCredits(creditsCents)
          if (label === null) return null
          const cost = formatCredits(deckCostCents) || '$0.50'
          const low = (creditsCents ?? 0) < (deckCostCents ?? 50)
          return (
            <div
              className={`credits-pill ${low ? 'is-low' : ''}`}
              title={`Credits remaining. Each deck costs ${cost}.`}
              aria-label={`Credits remaining: ${label}. Each deck costs ${cost}.`}
            >
              <span className="credits-pill-spark" aria-hidden>◈</span>
              <span className="credits-pill-amount">{label}</span>
              <span className="credits-pill-label">credits</span>
            </div>
          )
        })()}
        <button
          type="button"
          className="ghost-btn agent-five-btn"
          title="Open Agent Five — clarify and build with tools"
          onClick={() => {
            window.history.pushState({}, '', '/agentfive')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}
        >
          <span className="agent-five-spark" aria-hidden>✶</span>
          Agent Five
        </button>
        <button
          type="button"
          className={`ghost-btn icon-only theme-toggle-topbar theme-toggle-${themeMode}`}
          aria-label={`Theme: ${THEME_LABELS[themeMode]}`}
          title={`${THEME_LABELS[themeMode]} — click to switch`}
          onClick={onCycleTheme}
        >
          {THEME_ICONS[themeMode]}
        </button>

        <div className="tb-pop-wrap">
          <button
            type="button"
            className="avatar"
            title={userDisplayName(user) || 'Account'}
            onClick={() => setOpenMenu((v) => (v === 'avatar' ? null : 'avatar'))}
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
              {onSignOut ? (
                <>
                  <div className="tb-pop-divider" />
                  <button
                    type="button"
                    className="tb-pop-item"
                    onClick={() => {
                      setOpenMenu(null)
                      onSignOut()
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
