import './RecentGallery.css'

const decks = [
  {
    title: 'Acme Series A — pitch v3',
    edited: 'Edited 2 hours ago',
    cards: 14,
    bg: 'linear-gradient(135deg,#0f172a,#1e293b)',
    accent: '#7c5cff',
  },
  {
    title: 'Q2 product roadmap review',
    edited: 'Edited yesterday',
    cards: 9,
    bg: 'linear-gradient(135deg,#fef3c7,#fde68a)',
    accent: '#92400e',
  },
  {
    title: 'Brand refresh — internal proposal',
    edited: 'Edited 3 days ago',
    cards: 18,
    bg: 'linear-gradient(135deg,#fce7f3,#fbcfe8)',
    accent: '#9d174d',
  },
  {
    title: 'Onboarding handbook (engineering)',
    edited: 'Edited last week',
    cards: 22,
    bg: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
    accent: '#1e3a8a',
  },
]

export default function RecentGallery() {
  return (
    <section className="row">
      <div className="row-head">
        <h2 className="row-title">Recent decks</h2>
        <div className="view-toggle">
          <button className="vt-btn is-on" aria-label="Grid view">▦</button>
          <button className="vt-btn" aria-label="List view">≡</button>
        </div>
      </div>

      <div className="deck-grid">
        {decks.map((d) => (
          <article key={d.title} className="deck-card">
            <div className="deck-thumb" style={{ background: d.bg }}>
              <div className="deck-thumb-inner">
                <div className="deck-headline" style={{ color: d.accent }}>
                  {d.title}
                </div>
                <div className="deck-sub">Slide preview</div>
              </div>
              <div className="deck-pill">{d.cards} cards</div>
            </div>
            <div className="deck-meta">
              <div className="deck-title-row">
                <span className="deck-title">{d.title}</span>
                <button className="deck-more" aria-label="More options">⋯</button>
              </div>
              <span className="deck-edited">{d.edited}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
