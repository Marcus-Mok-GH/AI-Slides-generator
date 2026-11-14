import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  requestPasswordReset, resendVerificationCode, resetPassword, verifyEmail,
} from '../lib/api.js'
import { SampleDeckCard, SampleDeckViewer } from './SampleDeck.jsx'
import './LoginPage.css'

const RESEND_COOLDOWN_SECONDS = 30

export default function LoginPage() {
  const { login, register, loginWithGoogle } = useAuth()
  // Someone arriving from a shared deck asked for their own copy and almost
  // certainly has no account yet, so open on sign-up rather than "Welcome
  // back". Everyone else still gets the sign-in form.
  const [remixIntent] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('remix'),
  )
  // 'login' | 'register' | 'verify' | 'forgot' | 'reset'
  const [mode, setMode] = useState(remixIntent ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resetEnabled, setResetEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  // Visitors can page through a real example deck before creating an account.
  const [showSample, setShowSample] = useState(false)
  const emailRef = useRef(null)
  const codeRef = useRef(null)
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
        if (cancelled) return
        setGoogleClientId(cfg?.googleClientId || null)
        setResetEnabled(Boolean(cfg?.passwordResetEnabled))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Resend cooldown ticks down one second at a time.
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

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

  /** Park the visitor on the code screen with a fresh cooldown. */
  function goToVerify(emailValue, message) {
    setEmail(emailValue)
    setMode('verify')
    setCode('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setNotice(message)
    setCooldown(RESEND_COOLDOWN_SECONDS)
    window.setTimeout(() => codeRef.current?.focus(), 80)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login({ email, password })
      } else {
        // Names are optional on the server and nothing needs them — asking for
        // them just adds two fields before anyone has seen the product.
        const data = await register({ email, password })
        if (data?.verificationRequired) {
          const address = data.email || email
          goToVerify(
            address,
            data.emailSent === false
              ? 'We could not send the code just now — use resend to try again.'
              : `We sent a 6-digit code to ${address}.`,
          )
        }
      }
    } catch (err) {
      if (err?.code === 'email_unverified') {
        goToVerify(email, err.message || 'Confirm your email to continue.')
      } else {
        setError(err?.message || 'Something went wrong')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyEmail({ email, code })
      // The response signs us in; a reload hands the session to AuthProvider.
      // Keep the query string so an intended deck copy still goes through.
      window.location.replace(`/app${window.location.search}`)
    } catch (err) {
      setError(err?.message || 'Could not verify that code')
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setError('')
    setResending(true)
    try {
      await resendVerificationCode(email)
      setNotice(`New code sent to ${email}.`)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err?.message || 'Could not send a new code')
    } finally {
      setResending(false)
    }
  }

  async function sendResetCode() {
    setError('')
    setNotice('')
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setMode('reset')
      setCode('')
      setNotice(`If ${email} has an account, a 6-digit code is on its way.`)
    } catch (err) {
      setError(err?.message || 'Could not send the reset code')
    } finally {
      setLoading(false)
    }
  }

  function handleForgot(e) {
    e.preventDefault()
    sendResetCode()
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Those passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const data = await resetPassword({ email, code, password })
      if (data?.verificationRequired) {
        goToVerify(data.email || email, 'Password updated. Confirm your email to finish.')
      } else {
        window.location.replace(`/app${window.location.search}`)
      }
    } catch (err) {
      setError(err?.message || 'Could not reset your password')
      setLoading(false)
    }
  }

  function backToLogin() {
    setMode('login')
    setError('')
    setNotice('')
    setCode('')
    setPassword('')
    setConfirmPassword('')
  }

  const copy = {
    login: {
      title: 'Welcome back',
      sub: remixIntent
        ? 'Sign in to open your own copy of this deck.'
        : 'Sign in to continue building decks.',
    },
    register: {
      title: 'Create your account',
      sub: remixIntent
        ? 'One email and a password, then the deck opens as your own copy.'
        : 'Just an email and a password — no credit card.',
    },
    verify: {
      title: 'Check your email',
      sub: 'Enter the 6-digit code we sent you to finish setting up your account.',
    },
    forgot: {
      title: 'Reset your password',
      sub: 'We’ll email you a 6-digit code to confirm it’s you.',
    },
    reset: {
      title: 'Choose a new password',
      sub: 'Enter the code from your email, then pick a new password.',
    },
  }[mode]

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

        <h1 className="login-title">{copy.title}</h1>
        <p className="login-subtitle">{copy.sub}</p>

        {(mode === 'login' || mode === 'register') && googleClientId ? (
          <>
            <div className="login-google" ref={googleBtnRef} />
            <div className="login-divider">
              <span>or continue with email</span>
            </div>
          </>
        ) : null}

        {notice ? <div className="login-notice">{notice}</div> : null}
        {error ? <div className="login-error">{error}</div> : null}

        {mode === 'verify' ? (
          <form className="login-form" onSubmit={handleVerify}>
            <label className="login-field">
              <span className="login-label">6-digit code</span>
              <input
                ref={codeRef}
                className="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus={canAutoFocus}
              />
            </label>
            <p className="login-code-hint">
              Sent to <strong>{email}</strong> · the code expires in 10 minutes
            </p>

            <button
              type="submit"
              className="login-submit"
              disabled={loading || code.length < 6}
            >
              {loading ? 'Checking…' : 'Verify and continue'}
            </button>

            <div className="login-resend">
              {cooldown > 0 ? (
                <span>Didn’t get it? Resend in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  className="login-link"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Didn’t get it? Resend code'}
                </button>
              )}
            </div>
          </form>
        ) : mode === 'forgot' ? (
          <form className="login-form" onSubmit={handleForgot}>
            <label className="login-field">
              <span className="login-label">Email</span>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={canAutoFocus}
              />
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        ) : mode === 'reset' ? (
          <form className="login-form" onSubmit={handleReset}>
            <label className="login-field">
              <span className="login-label">6-digit code</span>
              <input
                className="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus={canAutoFocus}
              />
            </label>

            <label className="login-field">
              <span className="login-label">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                enterKeyHint="next"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <span className="login-hint">At least 6 characters</span>
            </label>

            <label className="login-field">
              <span className="login-label">Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                enterKeyHint="go"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>

            <button
              type="submit"
              className="login-submit"
              disabled={loading || code.length < 6}
            >
              {loading ? 'Saving…' : 'Update password'}
            </button>

            <div className="login-resend">
              <button
                type="button"
                className="login-link"
                onClick={sendResetCode}
                disabled={loading}
              >
                Send a new code
              </button>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
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
              <span className="login-label-row">
                <span className="login-label">Password</span>
                {mode === 'login' && resetEnabled ? (
                  <button
                    type="button"
                    className="login-forgot"
                    onClick={() => {
                      setMode('forgot')
                      setError('')
                      setNotice('')
                      setPassword('')
                      setConfirmPassword('')
                    }}
                  >
                    Forgot password?
                  </button>
                ) : null}
              </span>
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

            <button type="submit" className="login-submit" disabled={loading}>
              {loading
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        )}

        <div className="login-toggle">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button type="button" className="login-link" onClick={() => { setMode('register'); setError(''); setNotice('') }}>
                Sign up
              </button>
            </>
          ) : mode === 'register' ? (
            <>
              Already have an account?{' '}
              <button type="button" className="login-link" onClick={() => { setMode('login'); setError(''); setNotice('') }}>
                Sign in
              </button>
            </>
          ) : (
            <button type="button" className="login-link" onClick={backToLogin}>
              Back to sign in
            </button>
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
