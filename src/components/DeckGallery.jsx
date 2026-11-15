import { useLayoutEffect, useState } from 'react'
import HtmlSlide from './HtmlSlide.jsx'
import './DeckGallery.css'

/**
 * Public gallery on the landing page.
 *
 * Decks appear here only because their author switched "Show in gallery" on
 * in My Decks, so a share link is never published by accident. Each tile is
 * the deck's real first slide drawn by the same renderer as the stage, and the
 * whole tile links to that deck's public /share page — no account needed.
 *
 * The list is fetched by LandingPage, which also uses it to decide whether the
 * "Gallery" nav link belongs in the header. The section renders nothing at all
 * when there is nothing published or no database behind it, so the page never
 * shows an empty shelf.
 */

const CANVAS_W = 1280

/** Scale the canonical 1280x720 slide into the tile, same as the viewer rail. */
function useTileScale(el) {
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    if (!el) return undefined
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / CANVAS_W)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return scale
}

function GalleryTile({ deck }) {
  const [coverEl, setCoverEl] = useState(null)
  const scale = useTileScale(coverEl)
  const total = deck.slideCount || 1

  return (
    <a className="dg-card" href={`/share/${encodeURIComponent(deck.id)}`}>
      <span className="dg-cover" ref={setCoverEl} aria-hidden>
        <span
          className="dg-cover-zoom"
          style={{
            transform: `scale(${scale})`,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          {scale ? (
            <HtmlSlide
              slide={deck.cover}
              theme={deck.theme}
              index={0}
              total={total}
              deckTitle={deck.title}
            />
          ) : null}
        </span>
      </span>
      <span className="dg-meta">
        <span className="dg-title">{deck.title || 'Untitled deck'}</span>
        <span className="dg-count">{total} slides</span>
      </span>
      {/* The row is always rendered so tiles with and without a byline keep
          the same height in the grid. */}
      <span className={`dg-byline ${deck.author ? '' : 'dg-byline--empty'}`}>
        {deck.author ? (
          <>
            <span className="dg-avatar" aria-hidden>
              {deck.author.initials}
            </span>
            <span className="dg-author">{deck.author.name}</span>
          </>
        ) : null}
      </span>
    </a>
  )
}

export default function DeckGallery({ decks = [] }) {
  if (decks.length === 0) return null

  return (
    <section className="lp-section dg" id="gallery" aria-labelledby="dg-title">
      <div className="lp-section-head">
        <span className="lp-kicker">Gallery</span>
        <h2 id="dg-title" className="lp-h2">
          Decks other people started.
        </h2>
        <p className="lp-section-sub">
          Published by their authors. Open any of them full-screen — no account
          needed — or take one as the starting point for your own.
        </p>
      </div>

      <ul className="dg-grid">
        {decks.map((deck) => (
          <li key={deck.id}>
            <GalleryTile deck={deck} />
          </li>
        ))}
      </ul>
    </section>
  )
}
