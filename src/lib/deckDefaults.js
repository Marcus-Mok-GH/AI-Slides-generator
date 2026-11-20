/**
 * Default deck options.
 *
 * The composer generates immediately with these, and the customizer page opens
 * with them pre-selected — one shared object so the two paths never drift.
 */

import { lengthFromPrompt } from './pricing.js'

export const DEFAULT_DECK_OPTIONS = {
  length: '8 cards',
  tone: 'Professional',
  language: 'English',
  mode: 'detailed',
  userTheme: null,
}

/**
 * Defaults with the slide count the prompt itself asks for, when it names one.
 *
 * The quick-generate path (composer, landing-page build, first build after
 * sign-up) has no length control in front of it, so without this a brief that
 * says "10 slides" would be answered with eight.
 */
export function deckOptionsFor(prompt) {
  const length = lengthFromPrompt(prompt)
  return length ? { ...DEFAULT_DECK_OPTIONS, length } : DEFAULT_DECK_OPTIONS
}
