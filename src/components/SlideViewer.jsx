import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import SlideEditor from './SlideEditor.jsx'
import HtmlSlide from './HtmlSlide.jsx'
import ThumbPreview from './ThumbPreview.jsx'
import { getAuthHeaders } from '../lib/api.js'
import { exportDeckToPdf, exportDeckToPptx } from '../lib/exportDeck.js'
import './SlideViewer.css'

/* ----------------------------------------------------------------
   Slide canonical canvas. Every slide is laid out as if it lived on
   a fixed 1280×720 (16:9) page — the standard ratio used by modern
   slide tools — and we scale that page to fit whatever stage area
   is available. This keeps proportions, font sizes, and spacing
   identical across small previews, fullscreen, and exports.
   ---------------------------------------------------------------- */
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720

/** Trigger a browser download and clean the anchor/URL up afterwards. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 200)
}

/**
 * Observes a stage container and returns the largest scale factor at
 * which a SLIDE_WIDTH × SLIDE_HEIGHT slide will still fit. Returns 0
 * until the container has been measured to avoid flashing a 1× slide
 * before the first measurement.
 */
function useFitScale(containerRef) {
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      // Fit inside the padding box so framed stages keep their breathing room
      // on every breakpoint (mobile stage padding, landscape gutters, ...).
      const cs = getComputedStyle(el)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const w = Math.max(r.width - padX, 0)
      const h = Math.max(r.height - padY, 0)
      if (w === 0 || h === 0) return
      const s = Math.min(w / SLIDE_WIDTH, h / SLIDE_HEIGHT)
      setScale(s > 0 ? s : 0)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])
  return scale
}

function Slide({ slide, theme, index, total, deckTitle }) {
  const style = {
    '--slide-bg': theme?.background,
    '--slide-primary': theme?.primary,
    '--slide-accent': theme?.accent,
  }

  if (!slide.partial && slide.html) {
    return (
      <div className="slide html-slide" style={style}>
        <HtmlSlide
          slide={slide}
          theme={theme}
          index={index}
          total={total}
          deckTitle={deckTitle}
        />
      </div>
    )
  }

  // A slide that is still being written gets a calm placeholder: its title as
  // soon as we have one, plus layout-shaped skeletons. Never raw markup.
  return (
    <div className="slide partial-slide" style={style}>
      <div className="partial-slide-inner">
        <span className="partial-eyebrow">
          <span className="partial-dot" aria-hidden />
          Composing slide
        </span>
        <h2>{slide.title || `Slide ${index + 1}`}</h2>
        <div className="partial-lines" aria-hidden>
          <span className="shimmer-line" />
          <span className="shimmer-line" />
          <span className="shimmer-line short" />
        </div>
        <span className="partial-hint">Designing layout and typography…</span>
      </div>
      <div className="slide-footer">
        <span>{index + 1} / {total}</span>
      </div>
    </div>
  )
}

function ThinkingPanel({ theme, expectedCount, slidesSoFar, prompt, deckTitle, thinkingText }) {
  const streamRef = useRef(null)

  // Auto-scroll the reasoning stream to the bottom as new tokens arrive
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [thinkingText])

  // Soft tinted glow that picks up the deck's theme without imitating a slide.
  const style = {
    '--think-primary': theme?.primary || '#7c5cff',
    '--think-accent': theme?.accent || '#ff6ea0',
  }

  // 3-stage rough mapping that feels accurate without being noisy.
  // 0 → outlining, 1 → drafting slides, 2 → composing visuals.
  let stageIndex = 0
  if (slidesSoFar > 0 && slidesSoFar < expectedCount) stageIndex = 1
  else if (slidesSoFar >= expectedCount && expectedCount > 0) stageIndex = 2

  const stages = [
    { key: 'outline', label: 'Sketching outline' },
    { key: 'draft', label: 'Drafting slides' },
    { key: 'visuals', label: 'Composing visuals' },
  ]

  const headline =
    stageIndex === 0
      ? 'Thinking through your deck…'
      : stageIndex === 1
        ? `Drafting slide ${Math.min(slidesSoFar + 1, expectedCount)} of ${expectedCount}…`
        : 'Polishing visuals…'

  const subhead =
    stageIndex === 0
      ? "Reading your prompt and choosing a structure. Slides will start appearing in a few seconds."
      : stageIndex === 1
        ? "Each card streams in as soon as it's ready — feel free to scroll the side panel."
        : "Adding the last touches before everything settles in."

  const pct = expectedCount
    ? Math.min(100, Math.round((slidesSoFar / Math.max(expectedCount, 1)) * 100))
    : 0

  return (
    <div className="thinking-panel" style={style} role="status" aria-live="polite">
      <div className="thinking-aura" aria-hidden>
        <span className="thinking-aura-blob a" />
        <span className="thinking-aura-blob b" />
      </div>

      <div className="thinking-card">
        <div className="thinking-eyebrow">
          <span className="thinking-orb" aria-hidden>
            <span className="thinking-orb-ring" />
            <span className="thinking-orb-core" />
          </span>
          <span className="thinking-eyebrow-text">AI is thinking</span>
        </div>

        <h1 className="thinking-headline">{headline}</h1>
        <p className="thinking-sub">{subhead}</p>

        {thinkingText ? (
          <div className="thinking-stream thinking-stream--plain" ref={streamRef}>
            <p className="thinking-stream-text">{thinkingText}<span className="thinking-stream-caret">▌</span></p>
          </div>
        ) : prompt ? (
          <div className="thinking-prompt">
            <span className="thinking-prompt-label">Your prompt</span>
            <p className="thinking-prompt-text">
              {prompt.length > 220 ? prompt.slice(0, 217).trim() + '…' : prompt}
            </p>
          </div>
        ) : null}

        <div className="thinking-progress">
          <div className="thinking-progress-track">
            <div
              className="thinking-progress-fill"
              style={{ width: `${Math.max(pct, 6)}%` }}
            />
          </div>
          <div className="thinking-progress-label">
            {slidesSoFar > 0
              ? `${slidesSoFar} of ${expectedCount} ready`
              : `Preparing ${expectedCount} slides`}
          </div>
        </div>

        <ol className="thinking-stages">
          {stages.map((s, i) => {
            const state =
              i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'todo'
            return (
              <li key={s.key} className={`thinking-stage is-${state}`}>
                <span className="thinking-stage-marker" aria-hidden>
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <span className="thinking-stage-label">{s.label}</span>
              </li>
            )
          })}
        </ol>

        {deckTitle && deckTitle !== 'Generating…' ? (
          <div className="thinking-deck-title" title={deckTitle}>
            <span className="thinking-deck-title-label">Working title</span>
            <span className="thinking-deck-title-text">{deckTitle}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ============================================================
   Presentation (full-screen) mode
   ============================================================ */

function PresentMode({ slides, theme, active, total, deckTitle, onNext, onPrev, onExit }) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const scale = useFitScale(stageRef)
  const touchStartRef = useRef(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [dir, setDir] = useState(0) // -1 left, 0 none, 1 right (for animation)
  const slide = slides[active]

  /* Request full-screen on mount, listen for external exit (Esc key native) */
  useEffect(() => {
    const el = containerRef.current
    if (el && document.fullscreenEnabled) {
      el.requestFullscreen().catch(() => {})
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) onExit()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onExit])

  /* Keyboard navigation */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); setDir(1); onNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); setDir(-1); onPrev()
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else onExit()
      } else if (e.key === 'n' || e.key === 'N') {
        setNotesOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onPrev, onExit])

  function handleZoneClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    if (pct < 0.3) { setDir(-1); onPrev() }
    else if (pct > 0.7) { setDir(1); onNext() }
  }

  /* Swipe left/right to change slides on touch devices. */
  function handleTouchStart(e) {
    const t = e.changedTouches?.[0]
    if (!t) return
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e) {
    const start = touchStartRef.current
    touchStartRef.current = null
    const t = e.changedTouches?.[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    if (dx < 0) { setDir(1); onNext() }
    else { setDir(-1); onPrev() }
  }

  const pct = total > 1 ? Math.round(((active + 1) / total) * 100) : 100

  return (
    <div className="present-overlay" ref={containerRef}>
      {/* Slide area — clickable for nav */}
      <div
        className="present-stage"
        onClick={handleZoneClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="present-stage-inner" ref={stageRef}>
          {slide && scale > 0 ? (
            <div
              className="present-frame"
              style={{
                width: `${SLIDE_WIDTH}px`,
                height: `${SLIDE_HEIGHT}px`,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }}
            >
              <div
                key={active}
                className={`present-slide-anim present-slide-enter present-slide-enter-${dir === 1 ? 'right' : dir === -1 ? 'left' : 'none'}`}
              >
                <HtmlSlide
                  slide={slide}
                  theme={theme}
                  index={active}
                  total={total}
                  deckTitle={deckTitle}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="present-rotate-hint" aria-hidden>
          <span className="present-rotate-hint-icon">⟳</span>
          Rotate your phone for a bigger view
        </div>

        {/* Ghost click-zone hints */}
        {active > 0 && (
          <div className="present-zone-hint left" aria-hidden>
            <span className="present-arrow">‹</span>
          </div>
        )}
        {active < total - 1 && (
          <div className="present-zone-hint right" aria-hidden>
            <span className="present-arrow">›</span>
          </div>
        )}
      </div>

      {/* Bottom HUD */}
      <div className="present-hud">
        <button
          className="present-hud-btn"
          onClick={() => { setDir(-1); onPrev() }}
          disabled={active === 0}
          aria-label="Previous slide"
        >←</button>

        <div className="present-counter">
          <div className="present-progress">
            <div className="present-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="present-counter-text">{active + 1} / {total}</span>
        </div>

        <button
          className="present-hud-btn"
          onClick={() => { setDir(1); onNext() }}
          disabled={active === total - 1}
          aria-label="Next slide"
        >→</button>

        <div className="present-hud-sep" />

        <button
          className={`present-hud-btn ${notesOpen ? 'is-active' : ''}`}
          onClick={() => setNotesOpen(v => !v)}
          title="Toggle speaker notes (N)"
        >Notes</button>

        <button
          className="present-hud-btn present-exit"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
            else onExit()
          }}
          title="Exit presentation (Esc)"
        >✕ Exit</button>
      </div>

      {/* Speaker notes panel */}
      {notesOpen && slide?.speakerNotes && (
        <div className="present-notes">
          <div className="present-notes-label">Speaker notes</div>
          <p className="present-notes-text">{slide.speakerNotes}</p>
        </div>
      )}
    </div>
  )
}


/* One rail entry, shared by the desktop rail and the mobile strip. Both show
   a live 16:9 thumbnail of the actual slide, a number chip, and the title. */
function RailItemBase({ slide, index, total, theme, deckTitle, active, compact, onClick }) {
  const isPartial = slide?.partial
  const cls = [
    'rail-item',
    compact ? 'rail-item-compact' : '',
    active ? 'is-active' : '',
    !slide ? 'is-pending' : '',
    isPartial ? 'is-partial' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      role={compact ? 'tab' : undefined}
      aria-selected={compact ? active : undefined}
      className={cls}
      onClick={() => onClick?.(index)}
      disabled={!slide}
      aria-current={!compact && active ? 'true' : undefined}
      aria-label={slide?.title ? `Slide ${index + 1}: ${slide.title}` : `Slide ${index + 1}, loading`}
    >
      <span className="rail-thumb-wrap">
        {slide ? (
          <ThumbPreview
            slide={slide}
            theme={theme}
            index={index}
            total={total}
            deckTitle={deckTitle}
          />
        ) : (
          <span
            className="thumb-skeleton"
            style={{ background: theme?.background || '#0f0f1a' }}
          />
        )}
        <span className="rail-num">{index + 1}</span>
        {isPartial ? <span className="rail-partial-badge">writing…</span> : null}
      </span>
      <span className="rail-caption">
        {slide && slide.title ? (
          <span className="rail-title">
            {slide.title}
            {isPartial ? <span className="caret-blink">▌</span> : null}
          </span>
        ) : (
          <span className="rail-title shimmer-line" style={{ display: 'block', width: '70%' }} />
        )}
      </span>
    </button>
  )
}

/* Rail entries re-render only when their own slide or selection changes;
   during streaming the deck object is replaced on every event. */
const RailItem = memo(RailItemBase)

export default function SlideViewer({ deck, savingState, onDeckChange, onBack }) {
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [toast, setToast] = useState('')
  const userNavigatedRef = useRef(false)
  const prevCompletedRef = useRef(-1)
  const deckIdRef = useRef(deck.id)
  const stageRef = useRef(null)
  const stageScale = useFitScale(stageRef)

  function showToast(msg) {
    setToast(msg)
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => setToast(''), 2400)
  }

  async function handleShare() {
    if (isStreaming) return
    const link =
      deck.id && typeof window !== 'undefined'
        ? `${window.location.origin}/app/slide/${encodeURIComponent(deck.id)}`
        : window.location.href
    const shareData = {
      title: deck.title || 'Deck',
      text: deck.subtitle || `Check out this deck: ${deck.title}`,
      url: link,
    }
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        return
      }
    } catch {
      /* user cancelled — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(link)
      showToast('Share link copied to clipboard')
    } catch {
      window.prompt('Copy this link:', link)
    }
  }

  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState('') // '' | 'pdf' | 'pptx' | 'json'
  const [exportNote, setExportNote] = useState('')
  const exportMenuRef = useRef(null)

  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e) => {
      if (!exportMenuRef.current?.contains(e.target)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [exportOpen])

  function safeFileName() {
    return (
      (deck.title || 'deck')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'deck'
    )
  }

  function handleExportJson() {
    setExportOpen(false)
    if (isStreaming) return
    const exportable = {
      id: deck.id,
      title: deck.title,
      subtitle: deck.subtitle,
      theme: deck.theme,
      slides: deck.slides,
      meta: deck.meta,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(exportable, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = safeFileName()
    a.href = url
    a.download = `${name}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`Exported ${name}.json`)
  }

  async function handleExportPdf() {
    setExportOpen(false)
    if (isStreaming || exportBusy) return
    setExportBusy('pdf')
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ deck }),
      })
      if (!res.ok) {
        let msg = `Server error ${res.status}`
        try { msg = (await res.json()).error || msg } catch { /* ignore */ }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const degraded = res.headers.get('X-Export-Mode') === 'text'
      const safeName = (deck.title || 'deck')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'deck'

      // No browser on the server: render the deck here instead, so the file
      // still looks like the stage. The plain-text response stays as a
      // last resort if this browser cannot rasterize the slide document.
      if (degraded) {
        try {
          await exportDeckToPdf(deck, {
            onProgress: ({ index, total }) =>
              setExportNote(`Rendering ${index + 1}/${total}…`),
          })
          showToast('PDF downloaded — rendered in your browser')
          return
        } catch (err) {
          console.warn('[export pdf] browser render failed, using server file', err)
        }
      }

      downloadBlob(blob, `${safeName}.pdf`)
      showToast(degraded
        ? 'PDF downloaded as plain text — this browser could not render it'
        : 'PDF downloaded')
    } catch (err) {
      console.error('[export pdf]', err)
      showToast(`PDF export failed: ${err?.message || 'unknown error'}`)
    } finally {
      setExportBusy('')
      setExportNote('')
    }
  }

  async function handleExportPptx() {
    setExportOpen(false)
    if (isStreaming || exportBusy) return
    setExportBusy('pptx')
    try {
      const res = await fetch('/api/export/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ deck }),
      })
      if (!res.ok) {
        let msg = `Server error ${res.status}`
        try { msg = (await res.json()).error || msg } catch { /* ignore */ }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const degraded = res.headers.get('X-Export-Mode') === 'text'
      const safeName = (deck.title || 'deck')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'deck'

      if (degraded) {
        try {
          await exportDeckToPptx(deck, {
            onProgress: ({ index, total }) =>
              setExportNote(`Rendering ${index + 1}/${total}…`),
          })
          showToast('PPTX downloaded — rendered in your browser')
          return
        } catch (err) {
          console.warn('[export pptx] browser render failed, using server file', err)
        }
      }

      downloadBlob(blob, `${safeName}.pptx`)
      showToast(degraded
        ? 'PPTX downloaded as plain slides — this browser could not render it'
        : 'PPTX downloaded — open in Google Slides or PowerPoint')
    } catch (err) {
      console.error('[export pptx]', err)
      showToast(`PPTX export failed: ${err?.message || 'unknown error'}`)
    } finally {
      setExportBusy('')
      setExportNote('')
    }
  }

  const isStreaming = !!deck.streaming
  const slideCount = deck.slides.length
  const expectedCount = deck.expectedCount || slideCount
  const completedCount = deck.slides.reduce(
    (n, s) => n + (s && !s.partial ? 1 : 0),
    0,
  )

  // Follow the stream: whenever a slide finishes, show it — unless the user has
  // taken over navigation. Finishing a deck no longer snaps back to slide 1.
  useEffect(() => {
    const lastCompleted = deck.slides.reduce(
      (last, s, i) => (s && !s.partial ? i : last),
      -1,
    )
    if (
      isStreaming &&
      lastCompleted > prevCompletedRef.current &&
      !userNavigatedRef.current
    ) {
      setActive(lastCompleted)
    }
    prevCompletedRef.current = lastCompleted
    if (!isStreaming) {
      setActive((a) => Math.min(a, Math.max(deck.slides.length - 1, 0)))
    }
  }, [deck.slides, isStreaming])

  // A fresh generation follows from its first slide; a different saved deck
  // starts at slide 1; finishing a stream keeps the slide you were on.
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current
    wasStreamingRef.current = isStreaming

    if (isStreaming) {
      if (deck.slides.length === 0) {
        userNavigatedRef.current = false
        prevCompletedRef.current = -1
        setActive(0)
      }
      return
    }
    if (wasStreaming) return
    if (deckIdRef.current !== deck.id) {
      deckIdRef.current = deck.id
      userNavigatedRef.current = false
      prevCompletedRef.current = -1
      setActive(0)
    }
  }, [deck.id, deck.slides.length, isStreaming])

  const userJump = useCallback((i) => {
    userNavigatedRef.current = true
    setActive(i)
  }, [])

  /* Swipe left/right on the stage to move between slides (touch devices). */
  const stageTouchRef = useRef(null)
  function onStageTouchStart(e) {
    const t = e.changedTouches?.[0]
    if (!t) return
    stageTouchRef.current = { x: t.clientX, y: t.clientY }
  }
  function onStageTouchEnd(e) {
    const start = stageTouchRef.current
    stageTouchRef.current = null
    const t = e.changedTouches?.[0]
    if (!start || !t || slideCount === 0) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    userJump(
      dx < 0
        ? Math.min(active + 1, slideCount - 1)
        : Math.max(active - 1, 0),
    )
  }

  useEffect(() => {
    const handler = (e) => {
      if (presenting) return // PresentMode handles its own keyboard events
      const t = e.target
      const tag = t?.tagName
      const isFormField =
        tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
      if (isFormField) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        userJump(Math.min(active + 1, Math.max(slideCount - 1, 0)))
      } else if (e.key === 'ArrowLeft') {
        userJump(Math.max(active - 1, 0))
      } else if (e.key === 'Escape') {
        onBack?.()
      } else if ((e.key === 'f' || e.key === 'F') && !isFormField) {
        if (slide && !isStreaming) setPresenting(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, slideCount, onBack, presenting])

  const slide = deck.slides[active]

  function updateSlide(updated) {
    const nextSlides = deck.slides.map((s, i) => (i === active ? updated : s))
    onDeckChange?.({ ...deck, slides: nextSlides })
  }

  const progressPct = isStreaming
    ? Math.min(100, Math.round((completedCount / Math.max(expectedCount, 1)) * 100))
    : 100

  let statusText = ''
  if (isStreaming) {
    statusText =
      completedCount === 0
        ? 'Drafting slide 1…'
        : `Drafting slide ${Math.min(completedCount + 1, expectedCount)} of ${expectedCount}`
  } else if (savingState === 'saving') {
    statusText = 'Saving…'
  } else if (savingState === 'saved') {
    statusText = 'Saved'
  } else if (savingState === 'error') {
    statusText = 'Save failed'
  }

  const thumbItems = []
  for (let i = 0; i < Math.max(slideCount, isStreaming ? expectedCount : 0); i++) {
    thumbItems.push(deck.slides[i] || null)
  }

  // Keep the active slide's rail entry in view without ever scrolling the
  // page: the desktop rail scrolls vertically, the mobile strip horizontally.
  useEffect(() => {
    const item = document.querySelector('.rail-item.is-active')
    if (!item) return
    let container = item.parentElement
    while (container) {
      const cs = getComputedStyle(container)
      if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) break
      container = container.parentElement
    }
    if (!container) return
    const ir = item.getBoundingClientRect()
    const cr = container.getBoundingClientRect()
    const pad = 8
    const dy =
      ir.top < cr.top ? ir.top - cr.top - pad
        : ir.bottom > cr.bottom ? ir.bottom - cr.bottom + pad
          : 0
    const dx =
      ir.left < cr.left ? ir.left - cr.left - pad
        : ir.right > cr.right ? ir.right - cr.right + pad
          : 0
    if (dy || dx) {
      container.scrollBy({
        top: dy,
        left: dx,
        behavior: isStreaming ? 'auto' : 'smooth',
      })
    }
  }, [active, isStreaming])

  const hasCompletedSlides = completedCount > 0
  const showGenerating = !hasCompletedSlides || !slide
  const hasNotes = !!slide?.speakerNotes

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button
          className="vbar-btn vbar-back"
          onClick={onBack}
          aria-label="Back to create"
        >
          <span className="vbar-back-icon">←</span>
          <span className="vbar-back-label">Back to create</span>
        </button>
        <div className="vbar-title">
          <span className="vbar-deck">{deck.title}</span>
          <span className="vbar-meta">
            · {isStreaming ? `${completedCount}/${expectedCount}` : slideCount} slides ·{' '}
            {deck.theme?.name || 'Aurora'} theme
          </span>
          {statusText ? (
            <span
              className={`vbar-status ${isStreaming ? 'is-streaming' : ''}`}
              role="status"
              aria-live="polite"
            >
              {isStreaming ? <span className="dot-pulse" /> : null}
              {statusText}
            </span>
          ) : null}
        </div>
        {isStreaming ? (
          <div
            className="vbar-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Deck generation progress"
          >
            <div
              className="vbar-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
        <div className="vbar-actions">
          <button
            className="vbar-btn vbar-present-btn"
            onClick={() => setPresenting(true)}
            disabled={isStreaming || !slide}
            title={isStreaming ? 'Available when generation completes' : 'Present full-screen (F)'}
          >
            <span className="vbar-present-full">▶ Present</span>
            <span className="vbar-present-icon" aria-hidden>▶</span>
          </button>
          <button
            className={`vbar-btn ${editing ? 'is-active' : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={isStreaming}
            title={isStreaming ? 'Editing unlocks when generation completes' : editing ? 'Close slide editor' : 'Edit this slide'}
          >
            <span className="vbar-edit-full">{editing ? '✕ Close editor' : '✎ Edit'}</span>
            <span className="vbar-edit-mini" aria-hidden>{editing ? '✕' : '✎'}</span>
          </button>
          <button
            type="button"
            className="vbar-btn ghost vbar-only-wide"
            disabled={isStreaming}
            onClick={handleShare}
            title={isStreaming ? 'Available when generation completes' : 'Copy a shareable link'}
          >
            Share
          </button>
          <button
            type="button"
            className={`vbar-btn vbar-only-wide ${showNotes ? 'is-active' : ''}`}
            onClick={() => setShowNotes((v) => !v)}
            disabled={isStreaming || !hasNotes}
            title={
              isStreaming
                ? 'Available when generation completes'
                : !hasNotes
                ? 'No speaker notes on this slide'
                : showNotes
                ? 'Hide speaker notes'
                : 'Show speaker notes'
            }
          >
            {showNotes ? 'Hide notes' : 'Notes'}
          </button>
          <div className="export-menu-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="vbar-btn"
              disabled={isStreaming || !!exportBusy}
              onClick={() => setExportOpen((v) => !v)}
              title={isStreaming ? 'Available when generation completes' : 'Download deck'}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              {exportBusy === 'pdf'
                ? <><span className="vbar-export-full">{exportNote || 'Building PDF…'}</span><span className="vbar-export-icon" aria-hidden>⏳</span></>
                : exportBusy === 'pptx'
                  ? <><span className="vbar-export-full">{exportNote || 'Building PPTX…'}</span><span className="vbar-export-icon" aria-hidden>⏳</span></>
                  : <><span className="vbar-export-full">Export ▾</span><span className="vbar-export-icon" aria-hidden>↓</span></>}
            </button>
            {exportOpen && !isStreaming && !exportBusy && (
              <div className="export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportPdf}
                >
                  <span className="emi-title">PDF</span>
                  <span className="emi-sub">Print or share, page-per-slide</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportPptx}
                >
                  <span className="emi-title">PPTX</span>
                  <span className="emi-sub">Open in Google Slides or PowerPoint</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="export-menu-item"
                  onClick={handleExportJson}
                >
                  <span className="emi-title">JSON</span>
                  <span className="emi-sub">Raw deck data</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`viewer-body ${editing && !isStreaming ? 'with-editor' : ''}`}>
        <aside className="viewer-side">
          <div className="side-title">Slides</div>
          <ol className="thumb-list">
            {thumbItems.map((s, i) => (
              <li key={i}>
                <RailItem
                  slide={s}
                  index={i}
                  total={Math.max(slideCount, expectedCount)}
                  theme={deck.theme}
                  deckTitle={deck.title}
                  active={i === active}
                  onClick={userJump}
                />
              </li>
            ))}
          </ol>
        </aside>

        {/* Mobile-only horizontal slide rail */}
        <div className="thumb-strip" role="tablist" aria-label="Slides">
          {thumbItems.map((s, i) => (
            <RailItem
              key={i}
              slide={s}
              index={i}
              total={Math.max(slideCount, expectedCount)}
              theme={deck.theme}
              deckTitle={deck.title}
              active={i === active}
              compact
              onClick={userJump}
            />
          ))}
        </div>

        <main className="stage">
          <div
            className={`stage-slide-area${showGenerating ? ' is-generating' : ''}`}
            ref={stageRef}
            onTouchStart={onStageTouchStart}
            onTouchEnd={onStageTouchEnd}
          >
            {showGenerating ? (
              <ThinkingPanel
                theme={deck.theme || {}}
                expectedCount={expectedCount}
                slidesSoFar={completedCount}
                prompt={deck.meta?.prompt || ''}
                deckTitle={deck.title}
                thinkingText={deck.thinkingText || ''}
              />
            ) : (
              <div
                className="stage-frame"
                style={{
                  width: `${SLIDE_WIDTH}px`,
                  height: `${SLIDE_HEIGHT}px`,
                  transform: `translate(-50%, -50%) scale(${stageScale || 0.0001})`,
                  visibility: stageScale > 0 ? 'visible' : 'hidden',
                }}
              >
                <Slide
                  key={active}
                  slide={slide}
                  theme={deck.theme}
                  index={active}
                  total={Math.max(slideCount, expectedCount)}
                  deckTitle={deck.title}
                />
              </div>
            )}

            {!showGenerating && (
              <>
                <button
                  className="stage-nav prev"
                  onClick={() => userJump(Math.max(active - 1, 0))}
                  disabled={active === 0 || slideCount === 0}
                  aria-label="Previous slide"
                >
                  ‹
                </button>
                <button
                  className="stage-nav next"
                  onClick={() => userJump(Math.min(active + 1, slideCount - 1))}
                  disabled={slideCount === 0 || active >= slideCount - 1}
                  aria-label="Next slide"
                >
                  ›
                </button>
              </>
            )}

            {!showGenerating && (
              <div className="stage-footer">
                <div
                  className="stage-progress"
                  role="progressbar"
                  aria-valuenow={Math.round(((active + 1) / Math.max(slideCount, 1)) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Slide position"
                >
                  <div
                    className="stage-progress-fill"
                    style={{
                      width: `${Math.round(((active + 1) / Math.max(slideCount, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="stage-counter">
                  {slideCount === 0
                    ? 'Drafting…'
                    : `${active + 1} / ${Math.max(slideCount, expectedCount)}`}
                </span>
              </div>
            )}
          </div>

          {hasNotes && (
            <div className={`notes-panel ${showNotes ? 'is-open' : ''}`}>
              <div className="notes-panel-head">
                <span className="notes-panel-label">Speaker notes</span>
                <button
                  type="button"
                  className="notes-panel-close"
                  onClick={() => setShowNotes(false)}
                  aria-label="Hide speaker notes"
                >
                  ×
                </button>
              </div>
              <div className="notes-panel-body">
                <p>{slide?.speakerNotes || ''}</p>
              </div>
            </div>
          )}
        </main>

        {editing && !isStreaming && slide && (
          <SlideEditor
            deck={deck}
            slideIndex={active}
            onChangeSlide={updateSlide}
            onClose={() => setEditing(false)}
          />
        )}
        {editing && !isStreaming && slide && (
          <button
            className="editor-backdrop"
            aria-label="Close editor"
            onClick={() => setEditing(false)}
          />
        )}
      </div>

      {toast ? (
        <div className="vbar-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {presenting && !isStreaming && (
        <PresentMode
          slides={deck.slides}
          theme={deck.theme}
          active={active}
          total={slideCount}
          deckTitle={deck.title}
          onNext={() => setActive(i => Math.min(i + 1, slideCount - 1))}
          onPrev={() => setActive(i => Math.max(i - 1, 0))}
          onExit={() => setPresenting(false)}
        />
      )}
    </div>
  )
}
