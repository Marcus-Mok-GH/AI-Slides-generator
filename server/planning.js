/**
 * Plan mode — plan the story before a single slide is built.
 *
 * Two model calls power it:
 *   1. suggestPlanQuestions() — the few questions whose answers change the deck
 *   2. planDeck()             — an editable slide-by-slide outline
 *
 * The approved outline is then handed back to deck generation, where
 * buildPlanBlock() turns it into a hard constraint in the system prompt, so
 * the deck follows the plan instead of inventing a new story.
 */

import { DECK_MODEL } from './llm.js'
import { callLlm, extractJson } from './llmJson.js'
import { MAX_SLIDES, parseLength } from '../src/lib/pricing.js'

const MAX_QUESTIONS = 4

/**
 * The model is asked for JSON, but nothing guarantees the shape. Everything
 * below trims what it can and drops what it cannot use, so a malformed field
 * degrades one question (or one slide) instead of failing the whole feature.
 */
function normalizeQuestions(raw) {
  const list = Array.isArray(raw?.questions) ? raw.questions : []
  return list
    .filter((q) => q && typeof q === 'object' && String(q.question || '').trim())
    .slice(0, MAX_QUESTIONS)
    .map((q, i) => ({
      id: String(q.id || `q${i + 1}`).trim().slice(0, 40) || `q${i + 1}`,
      question: String(q.question).trim().slice(0, 240),
      why: q.why ? String(q.why).trim().slice(0, 240) : '',
      suggestions: (Array.isArray(q.suggestions) ? q.suggestions : [])
        .map((s) => String(s).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 4),
    }))
}

/** Shape an approved (or partially edited) plan into something safe to prompt with. */
export function sanitizePlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const slides = (Array.isArray(plan.slides) ? plan.slides : [])
    .filter((s) => s && typeof s === 'object' && String(s.title || '').trim())
    .slice(0, MAX_SLIDES)
    .map((s) => ({
      title: String(s.title).trim().slice(0, 200),
      purpose: s.purpose ? String(s.purpose).trim().slice(0, 400) : '',
      keyPoints: (Array.isArray(s.keyPoints) ? s.keyPoints : [])
        .map((p) => String(p).trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 6),
    }))
  if (slides.length === 0) return null

  return {
    title: plan.title ? String(plan.title).trim().slice(0, 200) : '',
    subtitle: plan.subtitle ? String(plan.subtitle).trim().slice(0, 400) : '',
    audience: plan.audience ? String(plan.audience).trim().slice(0, 300) : '',
    narrative: plan.narrative ? String(plan.narrative).trim().slice(0, 800) : '',
    slides,
  }
}

/**
 * The prompt block deck generation follows. Returns '' when there is no plan,
 * which keeps the unplanned path byte-for-byte identical to before.
 */
export function buildPlanBlock(plan) {
  const approved = sanitizePlan(plan)
  if (!approved) return ''

  const slides = approved.slides.map((s, i) => {
    const head = `  ${i + 1}. "${s.title}"${s.purpose ? ` — ${s.purpose}` : ''}`
    if (!s.keyPoints.length) return head
    return `${head}\n${s.keyPoints.map((p) => `     - ${p}`).join('\n')}`
  })

  return `APPROVED PLAN — the user reviewed and approved this outline. Build exactly this deck:
${approved.title ? `- Deck title: "${approved.title}"\n` : ''}${approved.subtitle ? `- Subtitle: "${approved.subtitle}"\n` : ''}${approved.audience ? `- Audience: ${approved.audience}\n` : ''}${approved.narrative ? `- Story arc: ${approved.narrative}\n` : ''}
${slides.join('\n')}

Follow the plan slide for slide: same count, same order, same ideas. Keep each
slide's title unless a sharper wording is clearly better. Cover every key point
on its own slide. Do not add topics the plan does not contain.`

}

export async function suggestPlanQuestions({ prompt, length, tone = 'Professional' }) {
  if (!prompt || !String(prompt).trim()) throw new Error('Missing prompt')

  const system = `You are a presentation strategist about to plan a deck from a short brief.
Ask the few questions whose answers would most change the deck — nothing else.

Return ONLY valid JSON (no prose, no code fences):
{
  "questions": [
    {
      "id": "audience",
      "question": "Who is in the room?",
      "why": "one short clause on why it matters",
      "suggestions": ["concrete answer", "concrete answer", "concrete answer"]
    }
  ]
}

Rules:
- 3 or 4 questions. Never more.
- Each question is one short sentence, answerable in a line.
- suggestions: 3 concrete answers the user can click, phrased in their own voice (max 8 words each).
- Cover only what the brief does NOT already say: audience, the outcome they want, must-include
  content or evidence, and what to avoid.
- Never ask about colors, themes, slide count, tone, or visual design — those are separate controls.
- Never ask a question the brief already answers.`

  const user = `Brief:
"""${String(prompt).trim()}"""

Planned length: ${parseLength(length)} slides. Tone: ${tone}.

Return the questions JSON now.`

  const content = await callLlm({ model: DECK_MODEL, system, user, maxTokens: 2000 })
  return normalizeQuestions(extractJson(content))
}

export async function planDeck({ prompt, answers = [], spec = {} }) {
  if (!prompt || !String(prompt).trim()) throw new Error('Missing prompt')

  const cardCount = parseLength(spec.length)
  const tone = spec.tone || 'Professional'
  const language = spec.language || 'English'
  const mode = spec.mode || 'default'

  const answerLines = (Array.isArray(answers) ? answers : [])
    .filter((a) => a && typeof a === 'object' && String(a.answer || '').trim())
    .slice(0, 10)
    .map((a) => `- ${String(a.question || a.id || 'Note').trim()}: ${String(a.answer).trim()}`)
  const answerText = answerLines.length
    ? answerLines.join('\n')
    : '(the user skipped the questions — work from the brief)'

  const system = `You are a senior presentation strategist. You do NOT write slides yet —
you write the plan a designer would follow.

Return ONLY valid JSON (no prose, no code fences):
{
  "title": "Deck title — punchy and specific",
  "subtitle": "One sentence that frames the deck",
  "audience": "Who this is for, in a phrase",
  "narrative": "2-3 sentences on the arc: how the story moves from the first slide to the last",
  "slides": [
    {
      "title": "Slide title — punchy and specific",
      "purpose": "What this one slide must accomplish",
      "keyPoints": ["specific point", "specific point"]
    }
  ]
}

Rules:
- Generate exactly ${cardCount} slides.
- One idea per slide. Titles are punchy and specific — never "Introduction", "Overview",
  "Agenda", or "Thank you".
- keyPoints: 2-4 per slide. Concrete nouns, real numbers where relevant. Never placeholders
  like "TBD", "[insert]", or "data here".
- Write in ${language}. Tone: ${tone}.
- Honor every constraint in the answers — especially the audience, what to include, what to avoid.
- The last slide must land the outcome the user asked for. The plan is the whole story: every
  slide advances it, nothing repeats.
- Depth: ${mode === 'concise' ? 'lean on headlines — few, sharp points per slide'
    : mode === 'detailed' ? 'substantial — every slide carries evidence and depth'
    : 'balanced — substantive but scannable'}.`

  const user = `Topic / brief:
"""${String(prompt).trim()}"""

Answers to your questions:
${answerText}

Length: exactly ${cardCount} slides. Tone: ${tone}. Language: ${language}.

Return the plan JSON now.`

  const content = await callLlm({ model: DECK_MODEL, system, user, maxTokens: 6000 })
  const parsed = extractJson(content)
  const plan = sanitizePlan(parsed)
  if (!plan) throw new Error('Model did not return a usable plan')

  // The outline is the contract with deck generation, so the narrative and
  // audience ride along for display even when the model omits them.
  return plan
}
