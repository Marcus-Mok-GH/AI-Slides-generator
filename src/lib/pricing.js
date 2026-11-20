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

/**
 * The slide count a prompt asks for in its own words — "a 10-slide pitch",
 * "8 cards", "an 8 slide overview" — as an options string, or null when it
 * names none.
 *
 * Quick-generate builds from a silent eight-slide default, so a visitor who
 * typed "10-slide" used to get eight slides and be charged for eight. Their
 * sentence is the brief, so the count in it wins over the default.
 */
export function lengthFromPrompt(prompt) {
  const match = String(prompt || '').match(/\b(\d{1,2})\s*[-\s]?\s*(?:slides?|cards?)\b/i)
  if (!match) return null
  const requested = parseInt(match[1], 10)
  if (!Number.isFinite(requested)) return null
  return `${Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, requested))} cards`
}

/** Price in cents for a requested deck length, rounded to the nearest cent. */
export function deckCostCents(length) {
  return Math.max(1, Math.round((BASE_DECK_CENTS * parseLength(length)) / BASE_SLIDES))
}

export const MIN_DECK_CENTS = deckCostCents(`${MIN_SLIDES} cards`)
export const MAX_DECK_CENTS = deckCostCents(`${MAX_SLIDES} cards`)

/**
 * Credits handed to a brand-new account. Single source of truth: the server
 * grants this (`server/db.js`) and the landing page advertises it, so the
 * promise and the balance in the top bar cannot drift apart.
 */
export const NEW_USER_CENTS = 500

/** Whole default-length decks that grant pays for (10 at 50¢ each). */
export const FREE_DECK_COUNT = Math.floor(NEW_USER_CENTS / BASE_DECK_CENTS)
