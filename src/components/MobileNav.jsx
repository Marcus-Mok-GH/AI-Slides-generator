import './MobileNav.css'

const NAV_ITEMS = [
  { id: 'new',        icon: '✦',  label: 'Create'    },
  { id: 'my-deck',    icon: '▤',  label: 'My Decks'  },
  { id: 'templates',  icon: '⊞',  label: 'Templates' },
  { id: 'agentfive',  icon: '✶',  label: 'Agent Five' },
]

export default function MobileNav({ activeNav, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ id, icon, label }) => (
        <button
          key={id}
          className={`mnav-item${activeNav === id ? ' is-active' : ''}`}
          onClick={() => onNavigate(id)}
          aria-current={activeNav === id ? 'page' : undefined}
        >
          <span className="mnav-icon" aria-hidden="true">{icon}</span>
          <span className="mnav-label">{label}</span>
          {activeNav === id && <span className="mnav-pip" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  )
}
