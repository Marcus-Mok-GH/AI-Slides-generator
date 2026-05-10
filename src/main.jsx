import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGuard from './components/AuthGuard.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGuard>
        <App />
      </AuthGuard>
    </AuthProvider>
  </React.StrictMode>,
)
