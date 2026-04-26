import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import CreateHero from './components/CreateHero.jsx'
import TemplateRow from './components/TemplateRow.jsx'
import RecentGallery from './components/RecentGallery.jsx'
import './App.css'

export default function App() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content">
          <CreateHero />
          <TemplateRow />
          <RecentGallery />
        </div>
      </div>
    </div>
  )
}
