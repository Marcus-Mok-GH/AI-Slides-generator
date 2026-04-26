import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import SlideViewer from './components/SlideViewer.jsx'
import { generateDeck } from './lib/api.js'
import './App.css'

export default function App() {
  const [deck, setDeck] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')

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

  if (deck) {
    return <SlideViewer deck={deck} onBack={() => setDeck(null)} />
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
          <RecentGallery />
        </div>
      </div>
    </div>
  )
}
