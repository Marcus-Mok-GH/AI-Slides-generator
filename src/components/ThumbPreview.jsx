import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildSlideDocument } from './HtmlSlide.jsx'

/**
 * Lightweight live thumbnail of a slide.
 *
 * Renders the real slide document (same buildSlideDocument pipeline as the
 * stage) inside a 1280x720 iframe scaled down with CSS transform. Each thumb
 * is a real iframe, so we only mount the ones that scroll near the viewport
 * (IntersectionObserver) and keep them mounted afterwards — the browser keeps
 * the painted frame, so revisiting a thumb is free.
 */

const CANVAS_W = 1280
const CANVAS_H = 720
const THUMB_W = 320
const SCALE = THUMB_W / CANVAS_W

export default function ThumbPreview({
  slide,
  theme,
  index,
  total,
  deckTitle,
  ready = true,
}) {
  const hostRef = useRef(null)
  const iframeRef = useRef(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [scale, setScale] = useState(SCALE)

  const docHtml = useMemo(
    () =>
      buildSlideDocument(slide, theme, {
        index,
        total,
        deckTitle,
      }),
    [slide, theme, index, total, deckTitle],
  )

  useEffect(() => {
    const el = hostRef.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setNearViewport(true)
            io.disconnect()
          }
        }
      },
      { rootMargin: '320px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // The wrap's width varies with layout (rail vs compact strip), so scale the
  // 1280-wide canvas to whatever box it lands in.
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setScale(w / CANVAS_W)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (nearViewport && ready && iframeRef.current) {
      iframeRef.current.srcdoc = docHtml
    }
  }, [nearViewport, ready, docHtml])

  return (
    <div ref={hostRef} className="thumb-frame" aria-hidden>
      {nearViewport && ready ? (
        <iframe
          ref={iframeRef}
          title=""
          tabIndex={-1}
          sandbox="allow-same-origin"
          className="thumb-iframe"
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            transform: `scale(${scale})`,
            background: theme?.background || '#0f0f1a',
          }}
        />
      ) : (
        <div
          className="thumb-skeleton"
          style={{ background: theme?.background || '#0f0f1a' }}
        />
      )}
    </div>
  )
}
