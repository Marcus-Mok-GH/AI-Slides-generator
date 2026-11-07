/**
 * Tests for the shared deck pricing helper.
 *
 * Covers:
 *  - length parsing from the UI's "N cards" strings
 *  - the 3–20 slide clamp and the 8-slide default fallback
 *  - per-slide rounding to whole cents
 *  - the costs the options page displays
 */

import { describe, it, expect } from 'vitest'
import {
  BASE_DECK_CENTS,
  BASE_SLIDES,
  MAX_DECK_CENTS,
  MAX_SLIDES,
  MIN_DECK_CENTS,
  MIN_SLIDES,
  deckCostCents,
  parseLength,
} from '../src/lib/pricing.js'

describe('parseLength', () => {
  it('reads the first number and ignores the rest of the label', () => {
    expect(parseLength('4 cards')).toBe(4)
    expect(parseLength('12 slides')).toBe(12)
    expect(parseLength('deck of 7')).toBe(7)
    expect(parseLength('16')).toBe(16)
  })

  it('clamps to the supported 3–20 range', () => {
    expect(MIN_SLIDES).toBe(3)
    expect(MAX_SLIDES).toBe(20)
    expect(parseLength('1 card')).toBe(3)
    expect(parseLength('99 cards')).toBe(20)
  })

  it('falls back to the 8-slide default when there is no number', () => {
    expect(BASE_SLIDES).toBe(8)
    for (const value of [undefined, null, '', 'auto', 'cards']) {
      expect(parseLength(value)).toBe(8)
    }
  })
})

describe('deckCostCents', () => {
  it('anchors the default 8-slide deck at 50 cents', () => {
    expect(BASE_DECK_CENTS).toBe(50)
    expect(deckCostCents('8 cards')).toBe(50)
    expect(deckCostCents(undefined)).toBe(50)
  })

  it('matches the prices shown in the composer for each length option', () => {
    expect(deckCostCents('4 cards')).toBe(25)
    expect(deckCostCents('8 cards')).toBe(50)
    expect(deckCostCents('12 cards')).toBe(75)
    expect(deckCostCents('16 cards')).toBe(100)
  })

  it('rounds fractional cents to the nearest whole cent', () => {
    // 6.25¢ per slide: 6 slides = 37.5¢, 14 slides = 87.5¢
    expect(deckCostCents('6 cards')).toBe(38)
    expect(deckCostCents('14 cards')).toBe(88)
    // 5 slides = 31.25¢, 7 slides = 43.75¢
    expect(deckCostCents('5 cards')).toBe(31)
    expect(deckCostCents('7 cards')).toBe(44)
  })

  it('uses the clamped slide count for out-of-range requests', () => {
    expect(deckCostCents('1 card')).toBe(MIN_DECK_CENTS)
    expect(deckCostCents('99 cards')).toBe(MAX_DECK_CENTS)
    expect(MIN_DECK_CENTS).toBe(19)
    expect(MAX_DECK_CENTS).toBe(125)
  })

  it('increases with slide count', () => {
    const costs = [3, 4, 8, 12, 16, 20].map((n) => deckCostCents(`${n} cards`))
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })
})
