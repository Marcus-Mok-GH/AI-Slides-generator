import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'slideai-theme'
const MODES = ['light', 'dark', 'system']

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function getInitialMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable
  }
  // Default to following the system setting.
  return 'system'
}

/**
 * Three-way theme hook. `mode` is the user's preference
 * (`'light' | 'dark' | 'system'`); `theme` is the resolved value actually
 * applied to <html> (`'light' | 'dark'`). When mode is `'system'` the
 * resolved theme tracks `prefers-color-scheme` live.
 */
export default function useTheme() {
  const [mode, setModeState] = useState(getInitialMode)
  const [systemTheme, setSystemTheme] = useState(getSystemTheme)

  // Track OS-level preference changes so `system` mode stays live.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = mode === 'system' ? systemTheme : mode

  // Apply the resolved theme to <html> and persist the user's mode choice.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore
    }
  }, [theme, mode])

  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return
    setModeState(next)
  }, [])

  // Cycle light → dark → system → light (handy for a single icon button).
  const cycle = useCallback(() => {
    setModeState((m) => {
      const i = MODES.indexOf(m)
      return MODES[(i + 1) % MODES.length]
    })
  }, [])

  return {
    mode,
    theme,
    setMode,
    cycle,
    isDark: theme === 'dark',
  }
}
