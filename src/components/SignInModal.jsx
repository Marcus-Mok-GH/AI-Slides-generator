import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import './SignInModal.css'

/**
 * Email + password sign-in modal backed by Supabase Auth. Tabs between
 * "Sign in" and "Create account" modes. Closes itself when auth succeeds —
 * the parent watches `signInOpen` from useAuth().
 */
export default function SignInModal({ open, onClose }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const emailRef = useRef(null)

  useEffect(() => {
    if (open) {
      setError('')
      setInfo('')
      setTimeout(() => emailRef.current?.focus(), 50)
    }
  }, [open, mode])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (err) throw err
        // onAuthStateChange in useAuth will close the modal
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        })
        if (err) throw err
        if (data?.user && !data.session) {
          setInfo(
            'Check your email to confirm your account, then come back and sign in.',
          )
        }
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleOAuth(provider) {
    setError('')
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      })
      if (err) throw err
    } catch (err) {
      setError(err?.message || `Failed to sign in with ${provider}`)
      setBusy(false)
    }
  }

  return (
    <div
      className="signin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="signin-modal">
        <button
          type="button"
          className="signin-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="signin-title" className="signin-title">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="signin-sub">
          {mode === 'signin'
            ? 'Sign in to keep building decks.'
            : 'Start drafting AI presentations in seconds.'}
        </p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <label className="signin-label">
            Email
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label className="signin-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              required
              minLength={6}
              placeholder="••••••••"
            />
          </label>

          {error ? <div className="signin-error">{error}</div> : null}
          {info ? <div className="signin-info">{info}</div> : null}

          <button
            type="submit"
            className="signin-submit"
            disabled={busy || !email || !password}
          >
            {busy
              ? 'Working…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <div className="signin-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="signin-oauth"
          onClick={() => handleOAuth('google')}
          disabled={busy}
        >
          Continue with Google
        </button>

        <p className="signin-switch">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => setMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
