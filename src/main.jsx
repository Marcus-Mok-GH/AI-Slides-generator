import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGuard from './components/AuthGuard.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import useTheme from './lib/useTheme.js'
import './index.css'

// AuthGuard renders LoginPage instead of <App /> while signed out, so the
// theme hook never mounts and the login screen ignores stored/OS dark mode.
// Apply the resolved theme at the root, independent of auth state.
function ThemeBoot() {
  useTheme()
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeBoot />
      <AuthGuard>
        <App />
      </AuthGuard>
    </AuthProvider>
  </React.StrictMode>,
)
