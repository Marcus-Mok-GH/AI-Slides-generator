import './Sidebar.css'

const nav = [
  { id: 'new', icon: '+', label: 'New', primary: true },
  { id: 'home', icon: '⌂', label: 'Home' },
  { id: 'inspiration', icon: '✦', label: 'Inspiration' },
  { id: 'templates', icon: '▦', label: 'Templates' },
  { id: 'my-deck', icon: '🗂', label: 'My deck' },
  { id: 'trash', icon: '🗑', label: 'Trash' },
]

const folders = ['Pitch decks', 'Marketing', 'Internal', 'Drafts']

export default function Sidebar({ activeNav = 'new', onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <span className="brand-name">Slide<span>AI</span></span>
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
              <span className="nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="section">
        <div className="section-title">Workspaces</div>
        <ul className="folder-list">
          {folders.map((f) => (
            <li key={f}>
              <button
                type="button"
                className="folder"
                onClick={() => onNavigate?.('my-deck')}
              >
                <span className="folder-dot" />
                {f}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="upgrade">
        <div className="upgrade-title">Upgrade to Pro</div>
        <p className="upgrade-text">
          Unlimited AI generations, unlimited decks, custom fonts.
        </p>
        <button
          type="button"
          className="upgrade-btn"
          onClick={() =>
            window.alert(
              'Pro is coming soon. For now, you have unlimited access in your workspace.',
            )
          }
        >
          Upgrade
        </button>
      </div>
    </aside>
  )
}
