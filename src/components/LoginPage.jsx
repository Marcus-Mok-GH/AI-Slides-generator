import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { SampleDeckCard, SampleDeckViewer } from './SampleDeck.jsx'
import './LoginPage.css'

export default function LoginPage() {
  const { login, register, loginWithGoogle } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Visitors can page through a real example deck before creating an account.
  const [showSample, setShowSample] = useState(false)
  const emailRef = useRef(null)
  // Auto-focusing on touch devices pops the keyboard instantly and hides the
  // page behind it — only pre-focus on pointer-precise devices.
  const canAutoFocus =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches &&
    window.matchMedia('(min-width: 721px)').matches

  // Google sign-in: fetch the public client id, then load Google Identity
  // Services only when the server is configured for it.
  const [googleClientId, setGoogleClientId] = useState(null)
  const googleBtnRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cancelled) setGoogleClientId(cfg?.googleClientId || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return
    let cancelled = false

    function renderGoogleButton() {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          if (!credential) return
          setError('')
          setLoading(true)
          try {
            await loginWithGoogle(credential)
          } catch (err) {
            setError(err?.message || 'Google sign-in failed')
          } finally {
            setLoading(false)
          }
        },
      })
      googleBtnRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme:
          document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'filled_black'
            : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: Math.min(googleBtnRef.current.offsetWidth || 320, 400),
      })
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = renderGoogleButton
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
    }
  }, [googleClientId])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login({ email, password })
      } else {
        await register({ email, password, firstName, lastName })
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-aside-inner">
          <div className="login-aside-brand">
            <span className="login-aside-mark">S</span>
            slideai
          </div>
          <h2 className="login-aside-title">
            From one prompt to a deck that looks designed.
          </h2>
          <p className="login-aside-lede">
            SlideAI writes, designs and lays out every slide as custom HTML —
            no templates, no blank-canvas paralysis.
          </p>
          <div className="login-aside-sample">
            <SampleDeckCard onOpen={() => setShowSample(true)} />
          </div>
          <ul className="login-aside-list">
            <li><span className="login-aside-check">✓</span> Export to PDF, PPTX or JSON</li>
            <li><span className="login-aside-check">✓</span> Edit any slide by describing the change</li>
            <li><span className="login-aside-check">✓</span> Every deck saved to your account</li>
          </ul>
        </div>
        <div className="login-aside-foot">© {new Date().getFullYear()} SlideAI</div>
      </aside>

      <div className="login-main">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">S</span>
          <span className="login-brand-name">slide<b>ai</b></span>
        </div>

        <h1 className="login-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="login-subtitle">
          {mode === 'login'
            ? 'Sign in to continue building decks.'
            : 'Start generating decks for free.'}
        </p>

        {googleClientId ? (
          <>
            <div className="login-google" ref={googleBtnRef} />
            <div className="login-divider">
              <span>or continue with email</span>
            </div>
          </>
        ) : null}

        {error ? <div className="login-error">{error}</div> : null}

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="login-row">
              <label className="login-field">
                <span className="login-label">First name</span>
                <input
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  required
                />
              </label>
              <label className="login-field">
                <span className="login-label">Last name</span>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  required
                />
              </label>
            </div>
          )}

          <label className="login-field">
            <span className="login-label">Email</span>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus={canAutoFocus}
            />
          </label>

          <label className="login-field">
            <span className="login-label">Password</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
            {mode === 'register' && (
              <span className="login-hint">At least 6 characters</span>
            )}
          </label>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <div className="login-toggle">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button type="button" className="login-link" onClick={() => { setMode('register'); setError('') }}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="login-link" onClick={() => { setMode('login'); setError('') }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>

        <div className="login-sample">
          <p className="login-sample-eyebrow">New here? This is what a deck looks like</p>
          <SampleDeckCard onOpen={() => setShowSample(true)} />
        </div>
      </div>

      {showSample ? (
        <SampleDeckViewer
          onClose={() => setShowSample(false)}
          onSignIn={() => {
            setShowSample(false)
            window.requestAnimationFrame(() => emailRef.current?.focus())
          }}
        />
      ) : null}
    </div>
  )
}
