import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import HtmlSlide from './HtmlSlide.jsx'
import { loadSharedDeck } from '../lib/api.js'
import { exportDeckToPdf, exportDeckToPptx } from '../lib/exportDeck.js'
import './SharedDeckPage.css'

/**
 * Public, read-only view of a deck opened from a share link.
 *
 * Anyone can open /share/{deckId} — no session, no account. That is the whole
 * point of the Share button in the viewer: the recipient is usually someone
 * who has never used SlideAI, so showing them a sign-in wall threw the link
 * away. The page renders the same slide documents the owner sees, with a
 * single call to action pointing at the app.
 */

const CANVAS_W = 1280
const CANVAS_H = 720

/**
 * Scales the canonical 1280x720 slide into whatever width the stage gets.
 * Takes the element itself (callback ref), not a ref object: the stage only
 * exists once the deck has loaded, so measuring on mount of the page would
 * run while it is still absent and leave the slide at scale 0.
 */
function useStageScale(el) {
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

export default function SharedDeckPage({ deckId }) {
  const [deck, setDeck] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | missing | error
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState('') // '' | 'pdf' | 'pptx'
  const [downloadNote, setDownloadNote] = useState('')
  const [stageEl, setStageEl] = useState(null)
  const scale = useStageScale(stageEl)

  useEffect(() => {
    let alive = true
    setState('loading')
    loadSharedDeck(deckId)
      .then((loaded) => {
        if (!alive) return
        const slides = Array.isArray(loaded?.slides) ? loaded.slides : []
        if (!slides.length) {
          setState('missing')
          return
        }
        setDeck(loaded)
        setIndex(0)
        setState('ready')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [deckId, attempt])

  // The tab title is the first thing a recipient sees in their link preview.
  useEffect(() => {
    if (!deck?.title) return undefined
    const previous = document.title
    document.title = `${deck.title} — SlideAI`
    return () => {
      document.title = previous
    }
  }, [deck?.title])

  const slides = deck?.slides || []
  const total = slides.length
  const slide = slides[index]

  const go = useCallback(
    (delta) => {
      setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)))
    },
    [total],
  )

  // Arrow keys (and space) move through the deck, like the owner's viewer.
  useEffect(() => {
    if (state !== 'ready') return undefined
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, go])

  /**
   * Download the shared deck as a file.
   *
   * Exports run in the browser here rather than through /api/export: the deck
   * is already loaded, and the visitor has no account, so there is nothing to
   * authorise. It is the same renderer the viewer falls back to, so the file
   * matches what is on screen slide for slide.
   */
  async function download(format) {
    if (!deck || busy) return
    setBusy(format)
    setDownloadNote('Preparing…')
    try {
      const render = format === 'pdf' ? exportDeckToPdf : exportDeckToPptx
      await render(deck, {
        onProgress: ({ index: i, total }) =>
          setDownloadNote(`Rendering slide ${i + 1} of ${total}…`),
      })
      setDownloadNote(`${format.toUpperCase()} downloaded`)
    } catch (err) {
      console.error(`[shared deck] ${format} export failed:`, err)
      setDownloadNote(`Couldn't build the ${format.toUpperCase()} — try again`)
    } finally {
      setBusy('')
    }
  }

  // Clear a finished/error note after a moment; progress notes replace it.
  useEffect(() => {
    if (!downloadNote || busy) return undefined
    const id = setTimeout(() => setDownloadNote(''), 5000)
    return () => clearTimeout(id)
  }, [downloadNote, busy])

  // Horizontal swipe on touch devices.
  const touchStart = useRef(null)
  function onTouchStart(e) {
    touchStart.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e) {
    const start = touchStart.current
    touchStart.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX
    if (end == null) return
    const dx = end - start
    if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1)
  }

  return (
    <div className="shared">
      <header className="shared-bar">
        <a className="shared-brand" href="/app" aria-label="SlideAI home">
          <span className="shared-brand-mark">S</span>
          <span className="shared-brand-name">
            slide<b>ai</b>
          </span>
        </a>

        <div className="shared-heading">
          {state === 'ready' ? (
            <>
              <span className="shared-deck-title">{deck.title || 'Untitled deck'}</span>
              <span className="shared-deck-meta">
                {total} {total === 1 ? 'slide' : 'slides'} · shared deck
              </span>
            </>
          ) : (
            <span className="shared-deck-meta">Shared deck</span>
          )}
        </div>

        {/* Carries the deck the visitor was reading through sign-up, so the
            app opens their own copy instead of a blank create page. */}
        <a
          className="shared-cta"
          href={
            state === 'ready'
              ? `/app?remix=${encodeURIComponent(deckId)}`
              : '/app'
          }
        >
          {state === 'ready' ? 'Start from this deck' : 'Make your own'}
          <span className="shared-cta-spark" aria-hidden>✦</span>
        </a>
      </header>

      {state === 'loading' ? (
        <div className="shared-center" role="status" aria-live="polite">
          <span className="shared-spinner" aria-hidden />
          <p className="shared-note">Loading deck…</p>
        </div>
      ) : state === 'missing' ? (
        <div className="shared-center">
          <h1 className="shared-empty-title">This deck isn&apos;t available</h1>
          <p className="shared-note">
            The link may have expired, or the deck was deleted by its owner.
          </p>
          <a className="shared-empty-cta" href="/app">
            Create your own deck
          </a>
        </div>
      ) : state === 'error' ? (
        <div className="shared-center">
          <h1 className="shared-empty-title">Couldn&apos;t load this deck</h1>
          <p className="shared-note">Check your connection and try again.</p>
          <button
            type="button"
            className="shared-empty-cta"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <main
          className="shared-main"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="shared-stage" ref={setStageEl}>
            <div
              className="shared-stage-zoom"
              style={{
                transform: `scale(${scale})`,
                visibility: scale ? 'visible' : 'hidden',
              }}
            >
              <HtmlSlide
                slide={slide}
                theme={deck.theme}
                index={index}
                total={total}
                deckTitle={deck.title}
              />
            </div>
          </div>

          <div className="shared-controls">
            <button
              type="button"
              className="shared-arrow"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="Previous slide"
            >
              ‹
            </button>

            <div className="shared-position">
              <div
                className="shared-progress"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={total}
                aria-valuenow={index + 1}
                aria-label={`Slide ${index + 1} of ${total}`}
              >
                <div
                  className="shared-progress-fill"
                  style={{ width: `${((index + 1) / total) * 100}%` }}
                />
              </div>
              <span className="shared-count">
                {index + 1} / {total}
              </span>
            </div>

            <button
              type="button"
              className="shared-arrow"
              onClick={() => go(1)}
              disabled={index === total - 1}
              aria-label="Next slide"
            >
              ›
            </button>
          </div>

          <div className="shared-download">
            <span
              className={`shared-download-label ${busy ? 'is-busy' : ''}`}
              role="status"
              aria-live="polite"
            >
              {downloadNote || 'Download deck'}
            </span>
            <div className="shared-download-actions">
              <button
                type="button"
                className="shared-download-btn"
                onClick={() => download('pdf')}
                disabled={!!busy}
                aria-label="Download this deck as a PDF"
              >
                PDF
              </button>
              <button
                type="button"
                className="shared-download-btn"
                onClick={() => download('pptx')}
                disabled={!!busy}
                aria-label="Download this deck as a PowerPoint file"
              >
                PPTX
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}
