import { useAuth } from '../context/AuthContext.jsx'
import '../App.css'

export default function AuthGuard({ children }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="route-loading">
        <div className="route-loading-spinner" aria-hidden />
        <div className="route-loading-text">Checking access…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="route-loading">
        <div className="route-loading-text">Deployment access required.</div>
      </div>
    )
  }

  return children
}
