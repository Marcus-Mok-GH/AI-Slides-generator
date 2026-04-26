import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import SlideViewer from './components/SlideViewer.jsx'
import {
  generateDeck,
  saveDeck as saveDeckApi,
  loadDeck,
  deleteDeck as deleteDeckApi,
  listDecks,
} from './lib/api.js'
import './App.css'

export default function App() {
  const [deck, setDeck] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | error
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

  // Debounced auto-save whenever an open deck changes.
  useEffect(() => {
    if (!deck) return
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
    setStatus('loading')
    setError('')
    try {
      const result = await generateDeck(payload)
      setDeck(result)
      setStatus('idle')
    } catch (e) {
      setError(e.message || 'Something went wrong')
      setStatus('error')
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
