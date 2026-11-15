/**
 * Shared LLM call + JSON extraction.
 *
 * Deck generation and plan mode both talk to the same provider and both need
 * a JSON object out of a chat completion, so the request shape and the
 * tolerant parser live here instead of being copied per feature.
 */

import { assertLlmKey, llmError, llmHeaders, llmUrl } from './llm.js'
import { repairJson } from './jsonRepair.js'

export async function callLlm({ model, system, user, maxTokens = 16000 }) {
  assertLlmKey()
  const res = await fetch(llmUrl('/chat/completions'), {
    method: 'POST',
    headers: llmHeaders(),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw llmError(res.status, text)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')
  return content
}

export function extractJson(text) {
  const candidates = [text.trim()]
  // Also try the content of a fenced code block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  // Also try just the outermost { … } span
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    // Try raw parse first
    try { return JSON.parse(candidate) } catch {}
    // Try with repair
    try { return JSON.parse(repairJson(candidate)) } catch {}
  }
  throw new Error('Model did not return parseable JSON')
}
