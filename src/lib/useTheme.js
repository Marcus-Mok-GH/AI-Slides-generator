import { useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'slideai-theme'

function getInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // localStorage unavailable
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function useTheme() {
  const [theme, setThemeState] = useState(getInitial)

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  // Listen for system preference changes when user hasn't explicitly chosen
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    function onChange(e) {
      // Only auto-switch if no explicit preference is stored
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {}
      setThemeState(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggle, isDark: theme === 'dark' }
}
