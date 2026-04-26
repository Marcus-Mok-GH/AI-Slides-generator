import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import SlideViewer from './components/SlideViewer.jsx'
import {
  streamGenerateDeck,
  saveDeck as saveDeckApi,
  loadDeck,
  deleteDeck as deleteDeckApi,
  listDecks,
} from './lib/api.js'
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

export default function App() {
  const [deck, setDeck] = useState(null)
  const [status, setStatus] = useState('idle') // idle | streaming | error
  const [error, setError] = useState('')
  const [savedDecks, setSavedDecks] = useState([])
  const [savingState, setSavingState] = useState('idle') // idle | saving | saved | error
  const saveTimer = useRef(null)

  const refreshDecks = useCallback(async () => {
    try {
      const decks = await listDecks()
      setSavedDecks(decks)
    } catch (e) {
      console.warn('Failed to load decks:', e)
    }
  }, [])

  useEffect(() => {
    refreshDecks()
  }, [refreshDecks])

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

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content">
          <CreateHero
            onGenerate={handleGenerate}
            status={status}
            error={error}
          />
          <TemplateRow />
          <RecentGallery
            decks={savedDecks}
            onOpen={handleOpenDeck}
            onDelete={handleDeleteDeck}
          />
        </div>
      </div>
    </div>
  )
}
