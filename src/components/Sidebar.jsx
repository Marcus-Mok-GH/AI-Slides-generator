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
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logo} alt="SlideAI" className="brand-logo" />
      </div>

      <nav className="nav">
        {nav.map((item) => {
          const isActive = activeNav === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
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
  )
}
