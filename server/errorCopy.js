/**
 * Visitor-safe copy for generation failures.
 *
 * Upstream errors arrive as raw provider text — "pollinations 429: rate limit
 * exceeded", missing-key configuration messages, socket hangs. None of that
 * means anything to the person waiting for their deck, and quoting it in the
 * composer reads as "the product is broken" at the exact moment they are
 * deciding whether to stay. The raw detail stays in the server logs; the
 * visitor gets calm, actionable copy instead.
 *
 * Every generation path deducts credits only after the deck succeeds, so
 * "you haven't been charged" is always true when these messages are shown.
 */

function statusOf(err) {
  if (err?.statusCode) return err.statusCode
  if (err?.status) return err.status
  // llmError() embeds the upstream status in the message: "pollinations 429: …"
  const match = /pollinations (\d{3})/.exec(String(err?.message || ''))
  return match ? Number(match[1]) : null
}

export function visitorErrorMessage(err) {
  // Errors already worded for the visitor (e.g. the edit instruction hint)
  // pass through untouched.
  if (err?.visitorSafe && err?.message) return err.message

  const msg = String(err?.message || '')
  const status = statusOf(err)

  if (status === 429 || /rate limit|quota|too many requests/i.test(msg)) {
    return 'The studio is handling a lot of requests right now. Give it a few seconds and generate again — you haven’t been charged.'
  }
  if (status === 401 || status === 403 || status === 503 || /api[_ ]?key|unauthorized|forbidden/i.test(msg)) {
    return 'Deck generation is briefly unavailable on our side. Try again in a minute — you haven’t been charged.'
  }
  if (/timeout|timed out|econn|enotfound|ehostunreach|fetch failed|network|socket/i.test(msg)) {
    return 'We lost the connection to the AI part-way through. Try again in a moment — you haven’t been charged.'
  }
  return 'Something went wrong while generating that deck. Try again in a moment — you haven’t been charged.'
}
