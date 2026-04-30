import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { resetPasswordEmail } from '../lib/api.js'
import './SignInModal.css'

/**
 * Sign-in / sign-up modal backed by Supabase Auth. Supports email +
 * password flows plus Google OAuth. The Supabase client manages the
 * session in localStorage; once a user signs in, `useAuth`'s
 * `onAuthStateChange` listener picks it up and the modal closes.
 */
export default function SignInModal({ open, onClose }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset form whenever the modal is reopened.
  useEffect(() => {
    if (!open) return
    setError(null)
    setInfo(null)
    setBusy(false)
  }, [open])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        onClose?.()
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setError('Please enter your email address.')
          return
        }
        await resetPasswordEmail(email.trim())
        setInfo('Check your email for a password reset link.')
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (data?.session) {
          // Email confirmations disabled — user is signed in immediately.
          onClose?.()
        } else {
          setInfo(
            'Check your email for a confirmation link to finish creating your account.',
          )
        }
      }
    } catch (err) {
      // Distinguish network/TypeError ("Load failed") from Supabase errors.
      const msg = err?.message || ''
      if (msg.includes('fetch failed') || msg.includes('Load failed') || err instanceof TypeError) {
        setError('Cannot reach the server. Please check your connection and try again.')
      } else {
        setError(err?.message || 'Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? window.location.origin + window.location.pathname
          : undefined
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) throw error
      // Browser navigates away to Google.
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('fetch failed') || msg.includes('Load failed') || err instanceof TypeError) {
        setError('Cannot reach the server. Please check your connection and try again.')
      } else {
        setError(err?.message || 'Google sign-in failed.')
      }
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
          {mode === 'signin'
            ? 'Welcome back'
            : mode === 'forgot'
              ? 'Reset your password'
              : 'Create your account'}
        </h2>
        <p className="signin-sub">
          {mode === 'signin'
            ? 'Sign in to keep building decks.'
            : mode === 'forgot'
              ? "Enter your email and we'll send you a reset link."
              : 'Sign up to save your decks and pick up where you left off.'}
        </p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <label className="signin-label">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          {mode !== 'forgot' && (
            <label className="signin-label">
              Password
              <input
                type="password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                minLength={6}
                required
              />
            </label>
          )}

          {error && <div className="signin-error">{error}</div>}
          {info && <div className="signin-info">{info}</div>}

          <button
            type="submit"
            className="signin-submit"
            disabled={busy}
          >
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Create account'}
          </button>

          {mode === 'signin' && (
            <p className="signin-forgot">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setError(null)
                  setInfo(null)
                  setPassword('')
                }}
              >
                Forgot password?
              </button>
            </p>
          )}
        </form>

        {mode !== 'forgot' && (
          <>
            <div className="signin-divider">or</div>

            <button
              type="button"
              className="signin-oauth"
              onClick={handleGoogle}
              disabled={busy}
            >
              Continue with Google
            </button>
          </>
        )}

        <p className="signin-switch">
          {mode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setInfo(null)
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              {mode === 'forgot' ? 'Remember your password? ' : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
              >
                {mode === 'forgot' ? 'Sign in' : 'Sign in'}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
