import { useEffect, useRef } from 'react'
import './Sidebar.css'
import logo from '../assets/slideai-logo.svg'

const nav = [
  { id: 'new', icon: '+', label: 'New', primary: true },
  { id: 'home', icon: '⌂', label: 'Home' },
  { id: 'templates', icon: '▦', label: 'Templates' },
  { id: 'my-deck', icon: '🗂', label: 'My Decks' },
]

const THEME_OPTIONS = [
  { id: 'light', icon: '☀', label: 'Light' },
  { id: 'dark', icon: '☾', label: 'Dark' },
  { id: 'system', icon: '🖥', label: 'System' },
]

export default function Sidebar({
  activeNav = 'new',
  onNavigate,
  themeMode = 'system',
  onSetThemeMode,
  drawerOpen = false,
  onCloseDrawer,
}) {
  const sidebarRef = useRef(null)
  const firstNavRef = useRef(null)
  const previousActiveRef = useRef(null)

  // Restore the element that had focus before the drawer opened.
  function restorePreviousFocus() {
    const prev = previousActiveRef.current
    if (prev && typeof prev.focus === 'function') {
      prev.focus()
    }
    previousActiveRef.current = null
  }

  // Focus the first nav button on open; restore previous focus on close.
  useEffect(() => {
    if (drawerOpen) {
      previousActiveRef.current = document.activeElement
      firstNavRef.current?.focus()
    } else {
      restorePreviousFocus()
    }
  }, [drawerOpen])

  // Trap focus inside the drawer while it is open.
  useEffect(() => {
    if (!drawerOpen) return

    const focusableSelector = [
      'button:not([disabled]):not([tabindex="-1"])',
      'a[href]:not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return

      const sidebar = sidebarRef.current
      if (!sidebar) return

      const focusable = Array.from(
        sidebar.querySelectorAll(focusableSelector),
      ).filter((el) => el.offsetParent !== null)
      if (focusable.length === 0) return

      const active = document.activeElement
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (active === first || !sidebar.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !sidebar.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  function handleNav(id) {
    onNavigate?.(id)
    onCloseDrawer?.()
  }
  return (
    <>
      <button
        type="button"
        className={`sb-backdrop ${drawerOpen ? 'is-open' : ''}`}
        onClick={onCloseDrawer}
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
      />
      <aside
        ref={sidebarRef}
        id="primary-nav"
        className={`sidebar ${drawerOpen ? 'is-open' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="brand">
          <img src={logo} alt="SlideAI" className="brand-logo" />
        </div>

        <nav className="nav">
          {nav.map((item, index) => {
            const isActive = activeNav === item.id
            return (
              <button
                key={item.id}
                ref={index === 0 ? firstNavRef : undefined}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`nav-item ${item.primary ? 'is-primary' : ''} ${
                  isActive && !item.primary ? 'is-active' : ''
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden>{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div
          className="theme-switch"
          role="radiogroup"
          aria-label="Color theme"
        >
          {THEME_OPTIONS.map((opt) => {
            const isActive = themeMode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`theme-switch-option ${isActive ? 'is-active' : ''}`}
                onClick={() => onSetThemeMode?.(opt.id)}
                title={`${opt.label} theme`}
              >
                <span className="theme-switch-icon" aria-hidden>{opt.icon}</span>
                <span className="theme-switch-label">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </aside>
    </>
  )
}
