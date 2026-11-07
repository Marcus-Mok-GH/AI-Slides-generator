/**
 * Background generation runner.
 *
 * runGenerationJob() is called WITHOUT await from the HTTP handler so it
 * executes completely independently of any client connection. All events are
 * written to the `generation_jobs` DB row as they arrive; a separate SSE
 * endpoint replays them to whoever is currently listening (including clients
 * that reconnect after closing the tab).
 *
 * Streaming writes are coalesced: reasoning text is buffered and in-flight
 * partials keep only their latest snapshot, so a 40-slide deck produces a few
 * dozen small appends instead of hundreds of growing JSONB updates. Writes are
 * also serialised through a promise chain — `slide` and `done` can never
 * overtake the events that belong before them.
 */

import {
  appendJobEvent,
  updateJobStatus,
  saveDeck,
  deductCredits,
  getCredits,
} from './db.js'
import { streamGenerateDeck } from './generateDeck.js'
import { deckCostCents } from '../src/lib/pricing.js'

/** How long buffered reasoning/partial updates may wait before a write. */
const FLUSH_MS = 120

export async function runGenerationJob(jobId, ctx, userId, startBalance) {
  const costCents = ctx.costCents ?? deckCostCents(ctx.length)
  let chain = Promise.resolve()
  let thinkingBuf = ''
  let thinkingType = 'reasoning'
  let flushTimer = null
  const pendingPartials = new Map()

  const append = (event, data) => {
    chain = chain
      .then(() => appendJobEvent(jobId, event, data))
      .catch((e) =>
        console.warn(`[jobRunner] failed to append ${event}:`, e?.message),
      )
    return chain
  }

  const flushBuffered = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (thinkingBuf) {
      append('thinking', { text: thinkingBuf, type: thinkingType })
      thinkingBuf = ''
    }
    for (const [index, partial] of pendingPartials) {
      append('partial', { index, partial })
    }
    pendingPartials.clear()
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushBuffered()
    }, FLUSH_MS)
  }

  try {
    await updateJobStatus(jobId, 'running')

    const deck = await streamGenerateDeck(ctx, {
      onThinking: ({ text, type }) => {
        if (!text) return
        if (!thinkingBuf) thinkingType = type || 'reasoning'
        thinkingBuf += text
        scheduleFlush()
      },
      onMeta: (data) => {
        flushBuffered()
        append('meta', data)
      },
      onPartial: ({ index, partial }) => {
        pendingPartials.set(index, partial)
        scheduleFlush()
      },
      onSlide: (data) => {
        // The closed slide supersedes any buffered snapshot of itself.
        pendingPartials.delete(data.index)
        flushBuffered()
        append('slide', data)
      },
    })

    flushBuffered()
    await chain

    if (ctx.userTheme?.primary) {
      deck.theme = { ...deck.theme, ...ctx.userTheme }
    }
    if (ctx.deckId) deck.id = ctx.deckId

    let savedDeck = deck
    try {
      const saved = await saveDeck(deck, userId)
      savedDeck = { ...deck, id: saved.id, updatedAt: saved.updatedAt }
    } catch (e) {
      console.warn('[jobRunner] failed to persist deck:', e?.message)
    }

    let balanceCents = startBalance
    try {
      const after = await deductCredits(userId, costCents)
      balanceCents = after ?? (await getCredits(userId))
    } catch (e) {
      console.warn('[jobRunner] credit deduction failed:', e?.message)
    }

    append('credits', { balanceCents, deckCostCents: costCents })
    append('done', { deck: savedDeck })
    await chain
    await updateJobStatus(jobId, 'completed')
  } catch (err) {
    console.error('[jobRunner] generation failed:', err)
    try {
      flushBuffered()
      append('error', { error: err?.message || 'Generation failed' })
      await chain
      await updateJobStatus(jobId, 'failed')
    } catch {}
  }
}
