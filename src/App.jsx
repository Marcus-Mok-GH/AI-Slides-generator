import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import SlideViewer from './components/SlideViewer.jsx'
import Landing from './components/Landing.jsx'
import {
  streamGenerateDeck,
  saveDeck as saveDeckApi,
  loadDeck,
  deleteDeck as deleteDeckApi,
  listDecks,
} from './lib/api.js'
import useTheme from './lib/useTheme.js'
import useAuth from './hooks/useAuth.js'
import './App.css'

const DEFAULT_THEME = {
  name: 'Aurora',
  primary: '#7c5cff',
  accent: '#ff6ea0',
  background: '#0f0f1a',
}

function parseLength(length) {
  const m = String(length).match(/(\d+)/)
  if (m) return Math.max(3, Math.min(20, parseInt(m[1], 10)))
  return 8
}

/**
 * Read the current location and decide which deck (if any) the URL is asking
 * for. We support `/slide/{id}` (canonical) and `?deck={id}` (legacy share
 * links). Returns the id or null.
 */
function deckIdFromLocation() {
  if (typeof window === 'undefined') return null
  const pathMatch = window.location.pathname.match(/^\/slide\/([^/?#]+)$/)
  if (pathMatch) {
    try {
      return decodeURIComponent(pathMatch[1])
    } catch {
      return pathMatch[1]
    }
  }
  const legacy = new URLSearchParams(window.location.search).get('deck')
  return legacy || null
}

export default function App() {
  const { user, loading: authLoading, isAuthenticated, signIn, signOut } =
    useAuth()
  const [deck, setDeck] = useState(null)
  const [status, setStatus] = useState('idle') // idle | streaming | error
  const [error, setError] = useState('')
  const [savedDecks, setSavedDecks] = useState([])
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | error
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNav, setActiveNav] = useState('new')
  // True on first paint if the URL points at a specific deck — keeps us from
  // flashing the create page while we fetch it.
  const [routeLoading, setRouteLoading] = useState(
    () => deckIdFromLocation() !== null,
  )
  const { isDark, toggle: toggleTheme } = useTheme()
  const saveTimer = useRef(null)
  const heroRef = useRef(null)

  const refreshDecks = useCallback(async () => {
    try {
      const decks = await listDecks()
      setSavedDecks(decks)
    } catch (e) {
      // 401s are handled globally via the useAuth hook; ignore here so we
      // don't spam the console while the user is on the landing page.
      if (e?.status !== 401) {
        console.warn('Failed to load decks:', e)
      }
    }
  }, [])

  // Refresh the gallery whenever the user signs in (and on any later
  // re-auth after a 401). Skipping this when logged-out avoids hitting the
  // protected endpoint while showing the landing page.
  useEffect(() => {
    if (isAuthenticated) refreshDecks()
    else setSavedDecks([])
  }, [isAuthenticated, refreshDecks])

  // After a successful login redirect, restore the deck URL the user was on
  // before they were sent to /api/login.
  useEffect(() => {
    if (!isAuthenticated) return
    let returnTo = null
    try {
      returnTo = sessionStorage.getItem('slideai:returnTo')
      if (returnTo) sessionStorage.removeItem('slideai:returnTo')
    } catch {
      /* ignore */
    }
    if (returnTo && window.location.pathname === '/' && returnTo !== '/') {
      window.history.replaceState({}, '', returnTo)
      // Trigger the URL-sync effect so the deck actually loads.
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [isAuthenticated])

  // ---------- URL routing ----------
  // Each deck lives at /slide/{id}. Loading that URL directly opens the deck;
  // closing the deck returns the URL to "/". Browser back/forward also work.

  // Honor the URL on first paint and whenever the user hits back/forward.
  // Skip while auth is still loading or the user is signed out — otherwise
  // every deck load returns 401 and clears the path.
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setRouteLoading(false)
      return
    }
    let cancelled = false

    const syncFromUrl = async () => {
      const id = deckIdFromLocation()
      if (!id) {
        setDeck((prev) => (prev ? null : prev))
        setRouteLoading(false)
        return
      }
      // If the same deck is already open, do nothing.
      if (deck?.id === id) {
        setRouteLoading(false)
        return
      }
      setRouteLoading(true)
      try {
        const loaded = await loadDeck(id)
        if (cancelled) return
        if (loaded) {
          setDeck(loaded)
          // Normalize legacy `?deck=` URLs to the canonical path.
          if (window.location.pathname !== `/slide/${encodeURIComponent(id)}`) {
            window.history.replaceState(
              { deckId: id },
              '',
              `/slide/${encodeURIComponent(id)}`,
            )
          }
        } else {
          // ID in URL but no such deck — clear the path so the user lands on
          // the create page instead of a phantom "loading" state.
          window.history.replaceState({}, '', '/')
        }
      } catch (e) {
        console.warn('Failed to load deck from URL:', e)
      } finally {
        if (!cancelled) setRouteLoading(false)
      }
    }

    syncFromUrl()
    const onPop = () => syncFromUrl()
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
    // We intentionally read the freshest `deck.id` inside the effect, so this
    // doesn't need to re-run on every deck change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  // Whenever the open deck's id changes (newly generated, opened from gallery,
  // or closed), reflect that in the URL bar. We hold off while routeLoading is
  // true so the initial `/slide/{id}` URL isn't briefly overwritten with "/"
  // before syncFromUrl has had a chance to load the deck.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (routeLoading) return
    const targetPath = deck?.id ? `/slide/${encodeURIComponent(deck.id)}` : '/'
    if (window.location.pathname === targetPath) return
    window.history.pushState({ deckId: deck?.id || null }, '', targetPath)
  }, [deck?.id, routeLoading])

  // Debounced auto-save whenever an open deck changes — but skip while the
  // deck is still streaming (the server persists it on stream completion).
  useEffect(() => {
    if (!deck || deck.streaming) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        const { id } = await saveDeckApi(deck)
        if (!deck.id || deck.id !== id) {
          setDeck((prev) => (prev ? { ...prev, id } : prev))
        }
        setSavingState('saved')
        refreshDecks()
      } catch (e) {
        console.warn('Failed to save deck:', e)
        setSavingState('error')
      }
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [deck, refreshDecks])

  async function handleGenerate(payload) {
    setError('')
    setStatus('streaming')
    const expectedCount = parseLength(payload.length)

    // Open the viewer immediately with a streaming stub.
    setDeck({
      title: 'Generating…',
      subtitle: payload.prompt.slice(0, 120),
      theme: DEFAULT_THEME,
      slides: [],
      meta: {
        model: 'claude-sonnet-4.6',
        prompt: payload.prompt,
        format: payload.format,
        length: payload.length,
        tone: payload.tone,
        language: payload.language,
        generatedAt: new Date().toISOString(),
      },
      streaming: true,
      expectedCount,
    })

    try {
      await streamGenerateDeck(payload, {
        onMeta: ({ title, subtitle, theme }) => {
          setDeck((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              title: title || prev.title,
              subtitle: subtitle || prev.subtitle,
              theme: { ...prev.theme, ...(theme || {}) },
            }
          })
        },
        onPartial: ({ index, partial }) => {
          setDeck((prev) => {
            if (!prev) return prev
            const slides = prev.slides.slice()
            const existing = slides[index] || {}
            // If the slide already arrived as a full slide, ignore late partials.
            if (existing && !existing.partial && existing.title) return prev
            slides[index] = {
              partial: true,
              title: partial.title || existing.title || '',
              layout: partial.layout || existing.layout || '',
              body: partial.body || existing.body || '',
              bullets: partial.bullets || existing.bullets || [],
              sectionLabel:
                partial.sectionLabel || existing.sectionLabel || '',
              imagePrompt:
                partial.imagePrompt || existing.imagePrompt || '',
            }
            return { ...prev, slides }
          })
        },
        onSlide: ({ slide, index }) => {
          setDeck((prev) => {
            if (!prev) return prev
            const slides = prev.slides.slice()
            slides[index] = slide
            return { ...prev, slides }
          })
        },
        onDone: (finalDeck) => {
          setDeck({ ...finalDeck, streaming: false })
          setStatus('idle')
          refreshDecks()
        },
        onError: (msg) => {
          setError(msg || 'Failed to generate')
          setStatus('error')
          setDeck(null)
        },
      })
    } catch (e) {
      setError(e.message || 'Something went wrong')
      setStatus('error')
      setDeck(null)
    }
  }

  async function handleOpenDeck(id) {
    try {
      const loaded = await loadDeck(id)
      if (loaded) setDeck(loaded)
    } catch (e) {
      setError(e.message || 'Failed to open deck')
    }
  }

  async function handleDeleteDeck(id) {
    try {
      await deleteDeckApi(id)
      refreshDecks()
    } catch (e) {
      console.warn('Failed to delete deck:', e)
    }
  }

  // Sidebar nav: each entry either scrolls to a section or runs an action.
  const handleNavigate = useCallback((id) => {
    setActiveNav(id)
    const scrollTargets = {
      home: 'create-hero',
      inspiration: 'create-hero',
      templates: 'templates-row',
      'my-deck': 'recent-decks',
      trash: 'recent-decks',
    }
    const targetId = scrollTargets[id]
    if (targetId) {
      const el = document.getElementById(targetId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (id === 'new' || id === 'home' || id === 'inspiration') {
      // small delay so the scroll-into-view animation can begin first
      setTimeout(() => heroRef.current?.focusPrompt?.(), 80)
    }
  }, [])

  // Filter saved decks by the topbar search query.
  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return savedDecks
    const q = searchQuery.trim().toLowerCase()
    return savedDecks.filter((d) =>
      [d.title, d.subtitle, d.theme?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [savedDecks, searchQuery])

  // ---------- auth gating ----------
  if (authLoading) {
    return (
      <div className="route-loading">
        <div className="route-loading-spinner" aria-hidden />
        <div className="route-loading-text">Loading…</div>
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Landing onSignIn={signIn} />
  }

  if (deck) {
    return (
      <SlideViewer
        deck={deck}
        savingState={savingState}
        onDeckChange={setDeck}
        onBack={() => {
          setDeck(null)
          refreshDecks()
        }}
      />
    )
  }

  if (routeLoading) {
    return (
      <div className="route-loading">
        <div className="route-loading-spinner" aria-hidden />
        <div className="route-loading-text">Loading deck…</div>
      </div>
    )
  }

  return (
    <div className="layout">
      <Sidebar activeNav={activeNav} onNavigate={handleNavigate} isDark={isDark} onToggleTheme={toggleTheme} />
      <div className="main">
        <TopBar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          deckCount={savedDecks.length}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          user={user}
          onSignOut={signOut}
        />
        <div className="content stagger-children">
          <CreateHero
            ref={heroRef}
            onGenerate={handleGenerate}
            status={status}
            error={error}
          />
          <TemplateRow
            onSelect={(template) => {
              heroRef.current?.applyTemplate?.(template)
            }}
          />
          <RecentGallery
            decks={filteredDecks}
            totalCount={savedDecks.length}
            query={searchQuery}
            onOpen={handleOpenDeck}
            onDelete={handleDeleteDeck}
          />
        </div>
      </div>
    </div>
  )
}
