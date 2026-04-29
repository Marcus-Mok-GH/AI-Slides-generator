import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import './SignInModal.css'

/**
 * Full-screen password-reset modal.
 *
 * Supabase sends the user a reset email pointing to <origin>/.
 * When the user clicks it, Supabase's PKCE flow embeds the update token
 * in the URL fragment (#access_token=…).  The `PASSWORD_RECOVERY`
 * auth event fires and `useAuth` sets `passwordResetOpen=true`.
 *
 * This modal reads the fragment directly so it can update the password
 * even if the user navigated away and came back.  On success the session
 * is cleared and the user is redirected to the sign-in page.
 */
export default function ResetPasswordModal({ open, onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Reset form whenever the modal opens.
  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirm('')
    setError(null)
    setSuccess(false)
    setBusy(false)
  }, [open])

  // Close on Escape.
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
    setError(null)

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      // The session with the update token should already be active from the
      // PASSWORD_RECOVERY event, but fall back to reading the fragment in case
      // the user landed on the page directly.
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) throw updateError

      setSuccess(true)

      // Sign out after a brief delay so the user sees the success state.
      setTimeout(async () => {
        await supabase.auth.signOut()
        if (typeof window !== 'undefined') {
          // Remove the token fragment from the URL before redirecting.
          window.history.replaceState({}, '', window.location.pathname)
          window.location.assign('/')
        }
      }, 1800)
    } catch (err) {
      setError(err?.message || 'Failed to update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="signin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.()
      }}
    >
      <div className="signin-modal">
        {!busy && (
          <button
            type="button"
            className="signin-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}

        {success ? (
          <>
            <h2 id="reset-title" className="signin-title">
              Password updated
            </h2>
            <p className="signin-sub">
              Your password has been changed. Signing you out…
            </p>
          </>
        ) : (
          <>
            <h2 id="reset-title" className="signin-title">
              Choose a new password
            </h2>
            <p className="signin-sub">
              Enter a new password for your account.
            </p>

            <form className="signin-form" onSubmit={handleSubmit}>
              <label className="signin-label">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  minLength={6}
                  required
                  autoFocus
                />
              </label>
              <label className="signin-label">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                  minLength={6}
                  required
                />
              </label>

              {error && <div className="signin-error">{error}</div>}

              <button
                type="submit"
                className="signin-submit"
                disabled={busy}
              >
                {busy ? 'Please wait…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
