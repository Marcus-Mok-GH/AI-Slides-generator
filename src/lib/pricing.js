/**
 * Deck pricing, shared by the server (charging) and the client (cost display).
 *
 * Pricing is anchored to the default 8-slide deck at 50¢ and scales linearly
 * with the requested slide count. The four options in the UI therefore cost
 * 25¢ / 50¢ / 75¢ / $1.00 for 4 / 8 / 12 / 16 slides.
 */

export const BASE_DECK_CENTS = 50
export const BASE_SLIDES = 8
export const MIN_SLIDES = 3
export const MAX_SLIDES = 20

/** Matches the server prompt builder: reads the first number, clamped 3–20. */
export function parseLength(length) {
  const m = String(length).match(/(\d+)/)
  if (m) return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, parseInt(m[1], 10)))
  return BASE_SLIDES
}

/** Price in cents for a requested deck length, rounded to the nearest cent. */
export function deckCostCents(length) {
  return Math.max(1, Math.round((BASE_DECK_CENTS * parseLength(length)) / BASE_SLIDES))
}

export const MIN_DECK_CENTS = deckCostCents(`${MIN_SLIDES} cards`)
export const MAX_DECK_CENTS = deckCostCents(`${MAX_SLIDES} cards`)
