import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import OptionsPage from './components/OptionsPage.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import TemplatesPage from './components/TemplatesPage.jsx'
import MyDecksPage from './components/MyDecksPage.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import SlideViewer from './components/SlideViewer.jsx'
import Landing from './components/Landing.jsx'
import AgentFive from './components/AgentFive.jsx'
import {
  streamGenerateDeck,
  saveDeck as saveDeckApi,
  loadDeck,
  deleteDeck as deleteDeckApi,
  renameDeck as renameDeckApi,
  listDecks,
} from './lib/api.js'
import useTheme from './lib/useTheme.js'
import useAuth from './hooks/useAuth.js'
import SignInModal from './components/SignInModal.jsx'
import ResetPasswordModal from './components/ResetPasswordModal.jsx'
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
 * for. We support `/app/slide/{id}` (canonical) and `?deck={id}` (legacy share
 * links). Returns the id or null.
 */
function deckIdFromLocation() {
  if (typeof window === 'undefined') return null
  const pathMatch = window.location.pathname.match(
    /^\/(?:app\/)?slide\/([^/?#]+)$/,
  )
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
  const {
    user,
    loading: authLoading,
    isAuthenticated,
    signIn,
    signInOpen,
    closeSignIn,
    signOut,
    passwordResetOpen,
    closePasswordReset,
  } = useAuth()
  const [deck, setDeck] = useState(null)
  const [status, setStatus] = useState('idle') // idle | streaming | error
  const [error, setError] = useState('')
  const [savedDecks, setSavedDecks] = useState([])
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | error
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNav, setActiveNav] = useState('new')
  const [createStep, setCreateStep] = useState('prompt') // 'prompt' | 'options'
  const [promptPayload, setPromptPayload] = useState(null) // { prompt, format }
  // True on first paint if the URL points at a specific deck — keeps us from
  // flashing the create page while we fetch it.
  const [routeLoading, setRouteLoading] = useState(
    () => deckIdFromLocation() !== null,
  )
  // Tracks the current pathname so navigating between /app and /agentfive
  // re-renders. window.history.pushState alone doesn't trigger React updates.
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  )
  const { mode: themeMode, setMode: setThemeMode, cycle: cycleTheme } = useTheme()
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
  // before they were sent to /api/login. Sign-in breaks out of the workspace
  // iframe, so returnTo is stashed in localStorage (sessionStorage doesn't
  // survive a top-level navigation). We still check sessionStorage as a
  // fallback for the non-iframe case.
  useEffect(() => {
    if (!isAuthenticated) return
    let returnTo = null
    try {
      returnTo =
        localStorage.getItem('slideai:returnTo') ||
        sessionStorage.getItem('slideai:returnTo')
      if (returnTo) {
        localStorage.removeItem('slideai:returnTo')
        sessionStorage.removeItem('slideai:returnTo')
      }
    } catch {
      /* ignore */
    }
    if (returnTo && window.location.pathname === '/' && returnTo !== '/') {
      window.history.replaceState({}, '', returnTo)
      // Trigger the URL-sync effect so the deck actually loads.
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [isAuthenticated])

  // Keep the authenticated app mounted at /app while preserving deep links.
  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) {
      if (window.location.pathname === '/') {
        window.history.replaceState({}, '', '/app')
        setCurrentPath('/app')
      }
      return
    }
    // Logged-out visitors should stay on the public landing page (also
    // bounce them off any protected route like /agentfive).
    const p = window.location.pathname
    if (p === '/app' || p.startsWith('/agentfive')) {
      window.history.replaceState({}, '', '/')
      setCurrentPath('/')
    }
  }, [authLoading, isAuthenticated])

  // Keep `currentPath` in sync with browser back/forward and any
  // pushState navigations (which we accompany with a `popstate` event).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // If the visitor typed a prompt on the public landing page, kick off
  // generation for them as soon as they're signed in.
  const pendingHandled = useRef(false)
  useEffect(() => {
    if (!isAuthenticated || pendingHandled.current) return
    let pending = null
    try {
      // Sign-in stores the prompt in localStorage so it survives the
      // top-level navigation; check sessionStorage too for older sessions.
      const raw =
        localStorage.getItem('slideai:pendingPrompt') ||
        sessionStorage.getItem('slideai:pendingPrompt')
      if (raw) {
        pending = JSON.parse(raw)
        localStorage.removeItem('slideai:pendingPrompt')
        sessionStorage.removeItem('slideai:pendingPrompt')
      }
    } catch {
      /* ignore */
    }
    if (pending?.prompt) {
      pendingHandled.current = true
      handleGenerate({
        prompt: pending.prompt,
        format: pending.format || 'presentation',
        length: pending.length || '8 cards',
        tone: pending.tone || 'Professional',
        language: pending.language || 'English',
      })
    }
    // handleGenerate is stable enough for this one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // ---------- URL routing ----------
  // Each deck lives at /app/slide/{id}. Loading that URL directly opens the
  // deck; closing the deck returns the URL to "/app". Browser back/forward
  // also work.

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
          // Normalize legacy `?deck=` and old `/slide/:id` URLs.
          if (
            window.location.pathname !==
            `/app/slide/${encodeURIComponent(id)}`
          ) {
            window.history.replaceState(
              { deckId: id },
              '',
              `/app/slide/${encodeURIComponent(id)}`,
            )
          }
        } else {
          // ID in URL but no such deck — clear the path so the user lands on
          // the create page instead of a phantom "loading" state.
          window.history.replaceState({}, '', '/app')
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
  // true so the initial `/app/slide/{id}` URL isn't briefly overwritten.
  // before syncFromUrl has had a chance to load the deck.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (routeLoading) return
    const targetPath = deck?.id
      ? `/app/slide/${encodeURIComponent(deck.id)}`
      : '/app'
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
    setCreateStep('prompt')
    const expectedCount = parseLength(payload.length)
    const userTheme = payload.userTheme || null

    // Mint a client-side id up front so we can navigate to /app/slide/{id}
    // immediately instead of waiting for the server to persist the deck.
    // The server reuses this id when it saves so the URL stays stable.
    const newDeckId =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    // Open the viewer immediately with a streaming stub.
    setDeck({
      id: newDeckId,
      title: 'Generating…',
      subtitle: payload.prompt.slice(0, 120),
      theme: userTheme ? { ...DEFAULT_THEME, ...userTheme } : DEFAULT_THEME,
      slides: [],
      meta: {
        model: 'claude-sonnet-4.6',
        prompt: payload.prompt,
        format: payload.format,
        length: payload.length,
        tone: payload.tone,
        language: payload.language,
        mode: payload.mode || 'default',
        generatedAt: new Date().toISOString(),
      },
      streaming: true,
      imagesGenerating: true,
      expectedCount,
    })

    try {
      await streamGenerateDeck({ ...payload, deckId: newDeckId }, {
        onThinking: ({ text }) => {
          setDeck((prev) => {
            if (!prev) return prev
            return { ...prev, thinkingText: (prev.thinkingText || '') + text }
          })
        },
        onMeta: ({ title, subtitle, theme }) => {
          setDeck((prev) => {
            if (!prev) return prev
            // Merge AI theme first, then apply user override on top if set.
            const merged = { ...prev.theme, ...(theme || {}) }
            return {
              ...prev,
              title: title || prev.title,
              subtitle: subtitle || prev.subtitle,
              theme: userTheme ? { ...merged, ...userTheme } : merged,
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
            // Preserve any imageStatus already set for this index.
            const existing = slides[index] || {}
            slides[index] = {
              ...slide,
              imageStatus: existing.imageStatus || slide.imageStatus || '',
            }
            return { ...prev, slides }
          })
        },
        onSlideImagePending: ({ index }) => {
          setDeck((prev) => {
            if (!prev) return prev
            const slides = prev.slides.slice()
            const existing = slides[index] || { partial: true }
            slides[index] = { ...existing, imageStatus: 'pending' }
            return { ...prev, slides }
          })
        },
        onSlideImage: ({ index, image }) => {
          setDeck((prev) => {
            if (!prev) return prev
            const slides = prev.slides.slice()
            const existing = slides[index] || {}
            slides[index] = {
              ...existing,
              image,
              imagePrompt: existing.imagePrompt || image?.prompt || '',
              imageStatus: 'ready',
            }
            return { ...prev, slides }
          })
        },
        onSlideImageFailed: ({ index }) => {
          setDeck((prev) => {
            if (!prev) return prev
            const slides = prev.slides.slice()
            const existing = slides[index] || {}
            slides[index] = { ...existing, imageStatus: 'failed' }
            return { ...prev, slides }
          })
        },
        onDone: (finalDeck) => {
          setDeck({
            ...finalDeck,
            // Prefer the id the server persisted; fall back to the client id
            // we minted up front so the URL stays valid in either case.
            id: finalDeck.id || newDeckId,
            streaming: false,
            imagesGenerating: false,
            // Re-apply user theme override — the server's finalDeck carries
            // the AI-generated theme which must not overwrite the user's pick.
            theme: userTheme
              ? { ...finalDeck.theme, ...userTheme }
              : finalDeck.theme,
          })
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

  async function handleRenameDeck(id, newTitle) {
    // Optimistically update the local list so the UI responds instantly.
    setSavedDecks((prev) =>
      prev.map((d) => (d.id === id ? { ...d, title: newTitle } : d)),
    )
    try {
      await renameDeckApi(id, newTitle)
    } catch (e) {
      console.warn('Failed to rename deck:', e)
      refreshDecks() // revert on failure
    }
  }

  // Sidebar nav: 'templates' and 'my-deck' are full pages; others scroll to section.
  const handleNavigate = useCallback((id) => {
    setActiveNav(id)
    setCreateStep('prompt') // always reset to prompt step when navigating
    if (id === 'templates' || id === 'my-deck') return // full-page views
    if (id === 'home') {
      const el = document.getElementById('create-hero')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => heroRef.current?.focusPrompt?.(), 80)
    }
    if (id === 'new') {
      setTimeout(() => heroRef.current?.focusPrompt?.(), 80)
    }
  }, [])

  // Called from TemplatesPage when user picks a template card.
  const handleUseTemplate = useCallback((name, promptText) => {
    setActiveNav('new')
    // Give React a tick to swap views, then fill the prompt.
    setTimeout(() => {
      heroRef.current?.applyPrompt?.(promptText)
    }, 60)
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
    return (
      <>
        <Landing onSignIn={signIn} />
        <SignInModal open={signInOpen} onClose={closeSignIn} />
      </>
    )
  }

  // Agent Five lives at /agentfive and /agentfive/[chatId]
  if (currentPath.startsWith('/agentfive')) {
    const chatIdMatch = currentPath.match(/^\/agentfive\/([^/?#]+)/)
    const chatId = chatIdMatch ? decodeURIComponent(chatIdMatch[1]) : null
    return <AgentFive chatId={chatId} />
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
      <Sidebar
        activeNav={activeNav}
        onNavigate={handleNavigate}
        themeMode={themeMode}
        onSetThemeMode={setThemeMode}
      />
      <div className="main">
        <TopBar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          themeMode={themeMode}
          onCycleTheme={cycleTheme}
          user={user}
          onSignOut={signOut}
        />
        {activeNav === 'templates' ? (
          <div className="content">
            <TemplatesPage onUseTemplate={handleUseTemplate} />
          </div>
        ) : activeNav === 'my-deck' ? (
          <div className="content">
            <MyDecksPage
              decks={savedDecks}
              query={searchQuery}
              onOpen={handleOpenDeck}
              onDelete={handleDeleteDeck}
              onRename={handleRenameDeck}
              onCreateNew={() => handleNavigate('new')}
            />
          </div>
        ) : createStep === 'options' && promptPayload ? (
          <div className="content">
            <OptionsPage
              initialFormat={promptPayload.format}
              onBack={() => setCreateStep('prompt')}
              onGenerate={(opts) =>
                handleGenerate({ ...promptPayload, ...opts })
              }
              status={status}
              error={error}
            />
          </div>
        ) : (
          <div className="content stagger-children">
            <CreateHero
              ref={heroRef}
              onContinue={({ prompt, format }) => {
                setPromptPayload({ prompt, format })
                setCreateStep('options')
              }}
              status={status}
              error={error}
            />
            <TemplateRow
              onSelect={(template) => {
                heroRef.current?.applyTemplate?.(template)
              }}
              onBrowseAll={() => handleNavigate('templates')}
            />
            <RecentGallery
              decks={filteredDecks}
              totalCount={savedDecks.length}
              query={searchQuery}
              onOpen={handleOpenDeck}
              onDelete={handleDeleteDeck}
              onRename={handleRenameDeck}
            />
          </div>
        )}
      </div>

      <ResetPasswordModal
        open={passwordResetOpen}
        onClose={closePasswordReset}
      />
    </div>
  )
}
