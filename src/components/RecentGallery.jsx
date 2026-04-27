import { useState } from 'react'
import './RecentGallery.css'

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = (Date.now() - then) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function DeckCard({ deck, onOpen, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const theme = deck.theme || {}
  const bg =
    theme.background ||
    `linear-gradient(135deg, ${theme.primary || '#7c5cff'}, ${theme.accent || '#ff6ea0'})`
  const accent = theme.accent || theme.primary || '#7c5cff'

  return (
    <article className="deck-card">
      <button
        className="deck-thumb"
        style={{ background: bg }}
        onClick={() => onOpen(deck.id)}
        aria-label={`Open ${deck.title}`}
      >
        <div className="deck-thumb-inner">
          <div className="deck-eyebrow" style={{ color: accent }}>
            {theme.name || 'Deck'}
          </div>
          <div className="deck-headline">{deck.title}</div>
          {deck.subtitle ? (
            <div className="deck-subline">{deck.subtitle}</div>
          ) : null}
        </div>
        <div className="deck-pill">{deck.slideCount} cards</div>
      </button>
      <div className="deck-meta">
        <div className="deck-title-row">
          <span className="deck-title">{deck.title}</span>
          <div className="deck-menu-wrap">
            <button
              className="deck-more"
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="deck-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onOpen(deck.id) }}>
                  Open
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false)
                    if (
                      window.confirm(`Delete "${deck.title}"? This can't be undone.`)
                    ) {
                      onDelete(deck.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <span className="deck-edited">Edited {timeAgo(deck.updatedAt)}</span>
      </div>
    </article>
  )
}

export default function RecentGallery({
  decks = [],
  totalCount,
  query = '',
  onOpen,
  onDelete,
}) {
  const [view, setView] = useState('grid') // 'grid' | 'list'
  const totalIsKnown = typeof totalCount === 'number'
  const isFiltering = query.trim().length > 0
  const showingEmptyDueToFilter = isFiltering && decks.length === 0

  return (
    <section className="row" id="recent-decks">
      <div className="row-head">
        <h2 className="row-title">
          {isFiltering
            ? `Search results${
                totalIsKnown ? ` (${decks.length} of ${totalCount})` : ''
              }`
            : 'Recent decks'}
        </h2>
        <div className="view-toggle" role="tablist" aria-label="View mode">
          <button
            type="button"
            className={`vt-btn ${view === 'grid' ? 'is-on' : ''}`}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            ▦
          </button>
          <button
            type="button"
            className={`vt-btn ${view === 'list' ? 'is-on' : ''}`}
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            ≡
          </button>
        </div>
      </div>

      {decks.length === 0 ? (
        <div className="empty">
          <div className="empty-art">✦</div>
          <div className="empty-title">
            {showingEmptyDueToFilter
              ? `No decks match "${query.trim()}"`
              : 'No decks yet'}
          </div>
          <p className="empty-sub">
            {showingEmptyDueToFilter
              ? 'Try a different search term, or clear the search to see all decks.'
              : 'Generate your first deck above and it will appear here.'}
          </p>
        </div>
      ) : (
        <div className={view === 'list' ? 'deck-list' : 'deck-grid'}>
          {decks.map((d) => (
            <DeckCard
              key={d.id}
              deck={d}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
