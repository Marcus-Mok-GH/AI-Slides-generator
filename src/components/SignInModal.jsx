import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  resetPasswordEmail,
  signInWithMagicLink,
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
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot' | 'magic'
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
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (mode !== 'forgot' && mode !== 'magic' && !password) {
      setError('Password is required.')
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
      } else if (mode === 'magic') {
        if (!email.trim()) {
          setError('Please enter your email address.')
          return
        }
        await signInWithMagicLink(email.trim())
        setInfo(
          'Check your email for a sign-in link. Click it from this device to sign in.',
        )
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
              : mode === 'magic'
                ? 'Sign in with a magic link'
                : 'Create your account'}
        </h2>
        <p className="signin-sub">
          {mode === 'signin'
            ? 'Sign in to keep building decks.'
            : mode === 'forgot'
              ? "Enter your email and we'll send you a reset link."
              : mode === 'magic'
                ? "Enter your email and we'll send you a one-click sign-in link."
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
          {mode !== 'forgot' && mode !== 'magic' && (
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
                  : mode === 'magic'
                    ? 'Email me a sign-in link'
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

        {mode !== 'forgot' && mode !== 'magic' && (
          <>
            <div className="signin-divider">or</div>

            <button
              type="button"
              className="signin-oauth"
              onClick={() => {
                setMode('magic')
                setError(null)
                setInfo(null)
                setPassword('')
              }}
              disabled={busy}
            >
              <svg className="signin-oauth-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 3l1.5 4.5L15 6l-1.5 4.5L18 12l-4.5 1.5L15 18l-4.5-1.5L9 21l-1.5-4.5L3 15l4.5-1.5L6 9l3-1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              Email me a magic link
            </button>

            <button
              type="button"
              className="signin-oauth"
              onClick={handleGoogle}
              disabled={busy}
              style={{ marginTop: 10 }}
            >
              <svg className="signin-oauth-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
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
              {mode === 'forgot'
                ? 'Remember your password? '
                : mode === 'magic'
                  ? 'Prefer a password? '
                  : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
