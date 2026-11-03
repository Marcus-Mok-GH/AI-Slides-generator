/**
 * Background generation runner.
 *
 * runGenerationJob() is called WITHOUT await from the HTTP handler so it
 * executes completely independently of any client connection. All events are
 * written to the `generation_jobs` DB row as they arrive; a separate SSE
 * endpoint replays them to whoever is currently listening (including clients
 * that reconnect after closing the tab).
 */

import {
  appendJobEvent,
  updateJobStatus,
  saveDeck,
  deductCredits,
  getCredits,
} from './db.js'
import { streamGenerateDeck } from './generateDeck.js'

export const DECK_GENERATION_CENTS = 50

export async function runGenerationJob(jobId, ctx, userId, startBalance) {
  const write = (event, data) =>
    appendJobEvent(jobId, event, data).catch((e) =>
      console.warn(`[jobRunner] failed to append ${event}:`, e?.message),
    )

  try {
    await updateJobStatus(jobId, 'running')

    const deck = await streamGenerateDeck(ctx, {
      onThinking: (data) => write('thinking', data),
      onMeta:     (data) => write('meta', data),
      onPartial:  (data) => write('partial', data),
      onSlide:    (data) => write('slide', data),
    })

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
      const after = await deductCredits(userId, DECK_GENERATION_CENTS)
      balanceCents = after ?? (await getCredits(userId))
    } catch (e) {
      console.warn('[jobRunner] credit deduction failed:', e?.message)
    }

    await write('credits', { balanceCents, deckCostCents: DECK_GENERATION_CENTS })
    await write('done', { deck: savedDeck })
    await updateJobStatus(jobId, 'completed')
  } catch (err) {
    console.error('[jobRunner] generation failed:', err)
    try {
      await write('error', { error: err?.message || 'Generation failed' })
      await updateJobStatus(jobId, 'failed')
    } catch {}
  }
}
