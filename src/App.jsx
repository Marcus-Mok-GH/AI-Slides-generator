import './App.css'

export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <div className="badge">Project Initialized</div>
        <h1>AI Slides Generator</h1>
        <p className="tagline">
          Your project is up and running. The repository was empty, so this is a
          starter scaffold ready for you to build on.
        </p>

        <div className="cards">
          <div className="card">
            <h3>1. Tell me what to build</h3>
            <p>
              Describe the slide-generation features you want — input forms,
              themes, AI integration, export to PPTX, and so on.
            </p>
          </div>
          <div className="card">
            <h3>2. I'll wire it up</h3>
            <p>
              I'll add the AI provider, slide rendering, and any required
              backend services to bring it to life.
            </p>
          </div>
          <div className="card">
            <h3>3. Iterate together</h3>
            <p>
              Preview here in real time as the app grows. Ask for tweaks at any
              time.
            </p>
          </div>
        </div>

        <footer className="foot">
          React + Vite scaffold · port 5000
        </footer>
      </header>
    </div>
  )
}
