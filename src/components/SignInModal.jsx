import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  resetPasswordEmail,
  signInWithPassword,
  signUpWithPassword,
} from '../lib/api.js'
import './SignInModal.css'

/**
 * Convert any thrown auth error into a friendly, accurate message.
 * Supabase responses include a `code` / `error_code`; network failures
 * surface as TypeError with messages like "Load failed" or "fetch failed".
 */
function formatAuthError(err) {
  if (!err) return null
  const code = err.code || err.error_code || err.status
  const msg = (err.message || '').trim()
  const detail = msg ? ` [${err.name || 'Error'}: ${msg}]` : ''

  if (
    err instanceof TypeError ||
    /load failed|fetch failed|networkerror|failed to fetch/i.test(msg)
  ) {
    return `Cannot reach the authentication server.${detail}`
  }
  if (code === 429 || /rate limit|over_email_send_rate_limit/i.test(msg)) {
    return 'Too many sign-up attempts. Please wait an hour and try again, or disable email confirmation in your Supabase dashboard.'
  }
  if (/invalid login credentials/i.test(msg)) {
    return 'That email and password combination did not match. Try again or reset your password.'
  }
  if (/user already registered|already_exists/i.test(msg)) {
    return 'An account with that email already exists. Try signing in instead.'
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Please confirm your email address before signing in (check your inbox).'
  }
  return msg
}

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
        await signInWithPassword({ email: email.trim(), password })
        onClose?.()
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setError('Please enter your email address.')
          return
        }
        await resetPasswordEmail(email.trim())
        setInfo('Check your email for a password reset link.')
      } else {
        const data = await signUpWithPassword({
          email: email.trim(),
          password,
        })
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
      console.error('[auth] sign-in/up failed', err)
      setError(formatAuthError(err) || 'Something went wrong.')
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
      console.error('[auth] Google sign-in failed', err)
      setError(formatAuthError(err) || 'Google sign-in failed.')
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
