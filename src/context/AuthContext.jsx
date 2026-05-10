import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { fetchCurrentUser, login as apiLogin, register as apiRegister, logout as apiLogout } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [credits, setCredits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadUser = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCurrentUser()
      setUser(data?.user || null)
      setCredits(data?.credits || null)
    } catch (err) {
      setUser(null)
      setCredits(null)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  useEffect(() => {
    function onUnauthorized() {
      setUser(null)
      setCredits(null)
      setError(new Error('Session expired. Please sign in again.'))
    }
    window.addEventListener('slideai:unauthorized', onUnauthorized)
    return () => window.removeEventListener('slideai:unauthorized', onUnauthorized)
  }, [])

  const handleLogin = useCallback(async (credentials) => {
    const data = await apiLogin(credentials)
    setUser(data?.user || null)
    setCredits(data?.credits || null)
    setError(null)
    return data
  }, [])

  const handleRegister = useCallback(async (credentials) => {
    const data = await apiRegister(credentials)
    setUser(data?.user || null)
    setCredits(data?.credits || null)
    setError(null)
    return data
  }, [])

  const handleLogout = useCallback(() => {
    apiLogout()
    setUser(null)
    setCredits(null)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      credits,
      loading,
      error,
      isAuthenticated: Boolean(user),
      setCredits,
      login: handleLogin,
      register: handleRegister,
      logout: handleLogout,
    }),
    [credits, error, loading, user, handleLogin, handleRegister, handleLogout],
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
