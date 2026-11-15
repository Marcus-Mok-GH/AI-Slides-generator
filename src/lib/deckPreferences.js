/**
 * Remembered deck preferences.
 *
 * One localStorage record so the two "Plan first" toggles agree and the
 * Customize page reopens on the choices from the last visit. Anything
 * unreadable or stale falls back to the defaults instead of throwing.
 */

import { DEFAULT_DECK_OPTIONS } from './deckDefaults.js'

const KEY = 'slideai:deckPrefs'
const MODES = ['concise', 'default', 'detailed']

export const DEFAULT_PREFS = {
  planFirst: false,
  length: DEFAULT_DECK_OPTIONS.length,
  tone: DEFAULT_DECK_OPTIONS.tone,
  language: DEFAULT_DECK_OPTIONS.language,
  mode: DEFAULT_DECK_OPTIONS.mode,
  themeId: null,
}

function cleanString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function loadDeckPrefs() {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }

  let stored = null
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) || 'null')
  } catch {
    return { ...DEFAULT_PREFS }
  }
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS }

  return {
    planFirst: stored.planFirst === true,
    // Length is a "N cards" string; a value from an older build that no longer
    // matches the buttons would leave the control looking blank.
    length: /^\d+\s+cards?$/.test(stored.length) ? stored.length : DEFAULT_PREFS.length,
    tone: cleanString(stored.tone, DEFAULT_PREFS.tone),
    language: cleanString(stored.language, DEFAULT_PREFS.language),
    mode: MODES.includes(stored.mode) ? stored.mode : DEFAULT_PREFS.mode,
    themeId: typeof stored.themeId === 'string' ? stored.themeId : null,
  }
}

/**
 * Forget the stored preferences. Callers get the defaults back so they can
 * reset their form state from the same values the next visit will read.
 */
export function resetDeckPrefs() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(KEY)
    } catch {
      // Same as above: remembering is a nicety, not a requirement.
    }
  }
  return { ...DEFAULT_PREFS }
}

/** Merge `patch` over the stored preferences and write them back. */
export function saveDeckPrefs(patch) {
  const next = { ...loadDeckPrefs(), ...patch }
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota — remembering is a nicety, never a requirement.
  }
  return next
}
