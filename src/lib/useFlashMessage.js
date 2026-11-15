import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A one-line confirmation that clears itself.
 *
 * Preferences save silently, so a short "Saved" is the only feedback the user
 * gets. The timer is cleared on unmount and on every new message, so a rapid
 * sequence of clicks shows one notice rather than a queue.
 */
export default function useFlashMessage(timeout = 2200) {
  const [message, setMessage] = useState('')
  const timer = useRef(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const notify = useCallback(
    (text) => {
      if (timer.current) clearTimeout(timer.current)
      setMessage(text)
      timer.current = setTimeout(() => {
        setMessage('')
        timer.current = null
      }, timeout)
    },
    [timeout],
  )

  return [message, notify]
}
