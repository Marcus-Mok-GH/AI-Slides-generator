import { useEffect } from 'react'
import './SignInModal.css'

/**
 * Sign-in modal for WorkOS AuthKit. The hosted sign-in / sign-up UI lives
 * on WorkOS, so this modal is just a launchpad: clicking the button does
 * a top-level navigation to /api/auth/login, which 302's to WorkOS.
 */
export default function SignInModal({ open, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleContinue() {
    const here =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/'
    window.location.assign(
      `/api/auth/login?returnTo=${encodeURIComponent(here)}`,
    )
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
          Welcome
        </h2>
        <p className="signin-sub">
          Sign in to keep building decks. We use WorkOS to handle accounts and
          single sign-on.
        </p>

        <button
          type="button"
          className="signin-submit"
          onClick={handleContinue}
        >
          Continue with WorkOS
        </button>

        <p className="signin-switch">
          New here? You'll be able to create an account on the next screen.
        </p>
      </div>
    </div>
  )
}
