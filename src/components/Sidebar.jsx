import './Sidebar.css'

const nav = [
  { icon: '+', label: 'New', primary: true },
  { icon: '⌂', label: 'Home' },
  { icon: '✦', label: 'Inspiration' },
  { icon: '▦', label: 'Templates' },
  { icon: '🗂', label: 'My deck' },
  { icon: '🗑', label: 'Trash' },
]

const folders = ['Pitch decks', 'Marketing', 'Internal', 'Drafts']

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <span className="brand-name">Slide<span>AI</span></span>
      </div>

      <nav className="nav">
        {nav.map((item) => (
          <button
            key={item.label}
            className={`nav-item ${item.primary ? 'is-primary' : ''}`}
          >
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="section">
        <div className="section-title">Workspaces</div>
        <ul className="folder-list">
          {folders.map((f) => (
            <li key={f} className="folder">
              <span className="folder-dot" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="upgrade">
        <div className="upgrade-title">Upgrade to Pro</div>
        <p className="upgrade-text">
          Unlimited AI generations, unlimited decks, custom fonts.
        </p>
        <button className="upgrade-btn">Upgrade</button>
      </div>
    </aside>
  )
}
