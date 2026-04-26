import './TopBar.css'

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-brand" aria-hidden>
        <div className="topbar-brand-mark">S</div>
        <span className="topbar-brand-name">Slide<span>AI</span></span>
      </div>

      <div className="search">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          type="text"
          placeholder="Search decks, templates, prompts…"
          aria-label="Search"
        />
        <kbd className="kbd">⌘K</kbd>
      </div>

      <div className="topbar-actions">
        <button className="ghost-btn">What's new</button>
        <button className="ghost-btn icon-only" aria-label="Notifications">
          🔔
        </button>
        <div className="avatar" title="Account">AS</div>
      </div>
    </header>
  )
}
