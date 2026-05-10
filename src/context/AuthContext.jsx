import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchCurrentUser } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [credits, setCredits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchCurrentUser()
        if (!alive) return
        setUser(data?.user || null)
        setCredits(data?.credits || null)
      } catch (err) {
        if (!alive) return
        setUser(null)
        setCredits(null)
        setError(err)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      credits,
      loading,
      error,
      isAuthenticated: Boolean(user),
      setCredits,
    }),
    [credits, error, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}
