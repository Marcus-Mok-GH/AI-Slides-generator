import { useCallback, useEffect, useState } from 'react'
import { fetchCredits } from '../lib/api.js'

/**
 * Tracks the user's credit balance.
 *
 * - Fetches on mount and whenever `isAuthenticated` flips on.
 * - `refresh()` re-pulls from the server (use after a deck generation).
 * - `setBalanceCents(n)` lets the streaming endpoint push a fresh balance
 *   in real time via the SSE `credits` event without a network round trip.
 */
export default function useCredits(isAuthenticated) {
  const [balanceCents, setBalanceCents] = useState(null)
  const [deckCostCents, setDeckCostCents] = useState(50)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setBalanceCents(null)
      return
    }
    setLoading(true)
    try {
      const data = await fetchCredits()
      if (data) {
        setBalanceCents(data.balanceCents ?? 0)
        if (typeof data.deckCostCents === 'number') {
          setDeckCostCents(data.deckCostCents)
        }
      }
    } catch (e) {
      console.warn('[credits] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    balanceCents,
    deckCostCents,
    loading,
    refresh,
    setBalanceCents,
  }
}
