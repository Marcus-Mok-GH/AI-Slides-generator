/**
 * JSON repair utilities for handling common LLM output malformations.
 *
 * LLMs frequently produce JSON with:
 *   - Trailing commas before ] or }
 *   - Missing commas between adjacent elements (e.g. }{ or ][)
 *   - Unescaped literal newlines/tabs/carriage-returns inside string values
 *
 * All repairs are string-aware — they track quote/escape state
 * character-by-character so they never corrupt valid string content.
 */

const JSON_WHITESPACE = ' \t\n\r'

/**
 * Repair common JSON malformations. Returns a string that is more likely
 * to parse successfully than the input.
 */
export function repairJson(s) {
  let result = ''
  let inStr = false
  let esc = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    // --- Inside a string ---
    if (esc) {
      result += ch
      esc = false
      continue
    }
    if (inStr) {
      if (ch === '\\') {
        result += ch
        esc = true
        continue
      }
      if (ch === '"') {
        result += ch
        inStr = false
        continue
      }
      // Unescaped control char — escape it
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
      result += ch
      continue
    }

    // --- Outside a string ---

    // Strip trailing commas before ] or } (with any whitespace gap)
    if (ch === ',' && i + 1 < s.length) {
      let j = i + 1
      while (j < s.length && JSON_WHITESPACE.includes(s[j])) j++
      if (j < s.length && (s[j] === ']' || s[j] === '}')) {
        // Skip this comma — it's trailing
        continue
      }
    }

    // Insert missing commas between adjacent elements.
    // Patterns like: }{  ][  ]"  "{  },{  },[
    const prevCh = result.length > 0 ? result[result.length - 1] : ''
    if (prevCh && i > 0) {
      const closingTokens = '}]\"'
      const openingTokens = '{[\"'
      if (closingTokens.includes(prevCh) && openingTokens.includes(ch)) {
        result += ','
      }
    }

    if (ch === '"') { inStr = true }
    result += ch
  }

  return result
}
