import { useState, useMemo, useEffect, useRef } from 'react'
import './MyDecksPage.css'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function DeckCard({ deck, view, onOpen, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef(null)
  const theme = deck.theme || {}
  const bg =
    theme.background ||
    `linear-gradient(135deg, ${theme.primary || '#7c5cff'}, ${theme.accent || '#ff6ea0'})`
  const accent = theme.accent || theme.primary || '#7c5cff'

  useEffect(() => {
    if (isRenaming) renameRef.current?.select()
  }, [isRenaming])

  function startRename() {
    setRenameValue(deck.title || '')
    setIsRenaming(true)
    setMenuOpen(false)
  }

  function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== deck.title) onRename?.(deck.id, trimmed)
    setIsRenaming(false)
  }

  function cancelRename() {
    setIsRenaming(false)
  }

  return (
    <article className={`deck-card ${view === 'list' ? 'deck-card--list' : ''}`}>
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
          {deck.subtitle && view !== 'list' ? (
            <div className="deck-subline">{deck.subtitle}</div>
          ) : null}
        </div>
        {view !== 'list' && (
          <div className="deck-pill">{deck.slideCount} cards</div>
        )}
      </button>

      <div className="deck-meta">
        <div className="deck-title-row">
          {isRenaming ? (
            <input
              ref={renameRef}
              className="deck-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') cancelRename()
              }}
              maxLength={120}
              aria-label="Rename deck"
            />
          ) : (
            <span className="deck-title">{deck.title}</span>
          )}
          <div className="deck-menu-wrap">
            <button
              className="deck-more"
              aria-label="More options"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="deck-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onOpen(deck.id) }}>Open</button>
                <button onClick={startRename}>Rename</button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false)
                    if (window.confirm(`Delete "${deck.title}"? This can't be undone.`)) {
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
        <div className="deck-meta-row">
          {view === 'list' && (
            <span className="deck-slide-count">{deck.slideCount} cards</span>
          )}
          <span className="deck-edited">Edited {timeAgo(deck.updatedAt)}</span>
        </div>
      </div>
    </article>
  )
}

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'az', label: 'A – Z' },
]

export default function MyDecksPage({ decks = [], query = '', onOpen, onDelete, onRename, onCreateNew }) {
  const [view, setView] = useState('grid')
  const [sort, setSort] = useState('newest')

  const filtered = useMemo(() => {
    let list = [...decks]
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((d) =>
        [d.title, d.subtitle, d.theme?.name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      )
    }
    if (sort === 'oldest') list.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
    else if (sort === 'az') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return list
  }, [decks, query, sort])

  const isFiltering = query.trim().length > 0
  const isEmpty = filtered.length === 0

  return (
    <div className="my-decks-page">
      <div className="my-decks-header">
        <div className="my-decks-title-group">
          <h1 className="my-decks-title">My Decks</h1>
          <span className="my-decks-count">
            {isFiltering
              ? `${filtered.length} of ${decks.length}`
              : `${decks.length} deck${decks.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="my-decks-controls">
          <div className="sort-select-wrap">
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort decks"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <span className="sort-select-caret" aria-hidden>▾</span>
          </div>

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
      </div>

      {isEmpty ? (
        <div className="empty my-decks-empty">
          <div className="empty-art">🗂</div>
          <div className="empty-title">
            {isFiltering ? `No decks match "${query.trim()}"` : 'No decks yet'}
          </div>
          <p className="empty-sub">
            {isFiltering
              ? 'Try a different search, or clear the search bar to see all decks.'
              : 'Generate your first deck to build your library.'}
          </p>
          {!isFiltering && (
            <button className="empty-cta" onClick={onCreateNew}>
              Create a deck →
            </button>
          )}
        </div>
      ) : (
        <div className={view === 'list' ? 'my-decks-list' : 'my-decks-grid'}>
          {filtered.map((d) => (
            <DeckCard
              key={d.id}
              deck={d}
              view={view}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  )
}
