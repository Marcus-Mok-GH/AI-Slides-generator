import { useEffect, useMemo, useRef } from 'react'
import { buildSlideDocument } from '../lib/slideDocument.js'

/**
 * Renders an AI-generated slide (slide.html + slide.css) inside a sandboxed
 * iframe sized to the canonical 1280x720 slide canvas.
 *
 * The document markup lives in `src/lib/slideDocument.js` because the PDF and
 * PPTX exporters build the same document — a downloaded deck is identical to
 * what the stage shows, charts and icon sprite included.
 */

const SLIDE_W = 1280
const SLIDE_H = 720

export default function HtmlSlide({ slide, theme, index, total, deckTitle }) {
  const iframeRef = useRef(null)

  const docHtml = useMemo(
    () => buildSlideDocument(slide, theme, { index, total, deckTitle }),
    [
      slide?.html,
      slide?.css,
      slide?.charts,
      theme?.background,
      theme?.primary,
      theme?.accent,
      index,
      total,
      deckTitle,
    ],
  )

  // Setting srcdoc directly via React caused some quirks with caching of the
  // base64 image; assign it imperatively so the iframe always reloads.
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = docHtml
    }
  }, [docHtml])

  return (
    <iframe
      ref={iframeRef}
      title={slide?.title || 'Slide'}
      className="html-slide-frame"
      sandbox="allow-same-origin"
      style={{
        width: `${SLIDE_W}px`,
        height: `${SLIDE_H}px`,
        border: 0,
        background: theme?.background || '#0f0f1a',
        display: 'block',
      }}
    />
  )
}
