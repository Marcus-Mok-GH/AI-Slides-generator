/**
 * Tests for the public gallery data path in server/db.js.
 *
 * Covers:
 *  - migrate() adds the `is_public` column and its partial index
 *  - listPublicDecks() only reads opted-in decks and maps the cover slide
 *  - setDeckPublic() returns null for a deck the caller does not own
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Load a fresh copy of server/db.js with a mocked driver. `rowsFor` receives
 * the SQL and params of each query and returns the rows to answer with, so a
 * test can shape results per statement.
 */
async function loadDb(rowsFor = () => []) {
  vi.resetModules()

  const savedEnv = { ...process.env }
  delete process.env.POSTGRES_URL
  process.env.POSTGRES_URL = 'postgres://user:pass@localhost:5432/mydb'

  const captured = []
  const pool = {
    on: vi.fn(),
    query: vi.fn(async (sql, params) => {
      captured.push({ sql, params })
      return { rows: rowsFor(sql, params) }
    }),
    end: vi.fn().mockResolvedValue(undefined),
  }

  function Pool() {
    return pool
  }

  vi.doMock('pg', () => ({ default: { Pool } }))
  vi.doMock('@neondatabase/serverless', () => ({ Pool, neonConfig: {} }))
  vi.doMock('ws', () => ({ default: {} }))

  const mod = await import('../server/db.js')
  await mod.getPool()

  process.env = savedEnv

  return { mod, captured }
}

describe('public gallery in server/db.js', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('migrate() adds the is_public column and a partial index', async () => {
    const { mod, captured } = await loadDb()
    await mod.migrate()

    const decksMigration = captured.find((q) =>
      q.sql.includes('CREATE TABLE IF NOT EXISTS decks'),
    )
    expect(decksMigration).toBeDefined()
    expect(decksMigration.sql).toContain(
      'ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE',
    )

    const indexQuery = captured.find((q) =>
      q.sql.includes('idx_decks_public_updated_at'),
    )
    expect(indexQuery).toBeDefined()
    expect(indexQuery.sql).toContain('WHERE is_public')
  })

  it('listPublicDecks() reads only published decks and maps the cover slide', async () => {
    const row = {
      id: 'deck-1',
      title: 'Seed round',
      subtitle: 'Lumen',
      slide_count: 8,
      theme: { primary: '#7c5cff' },
      cover: { html: '<div class="slide"></div>' },
      updated_at: '2026-11-15T00:00:00Z',
      first_name: 'Dana',
      last_name: 'Whitfield',
    }
    const { mod, captured } = await loadDb((sql) =>
      sql.includes('FROM decks') ? [row] : [],
    )

    const decks = await mod.listPublicDecks(6)

    const query = captured.find((q) => q.sql.includes('FROM decks'))
    expect(query.sql).toContain('WHERE d.is_public IS TRUE')
    expect(query.sql).toContain("data->'slides'->0 AS cover")
    expect(query.sql).toContain('LEFT JOIN users')
    expect(query.params).toEqual([6])

    expect(decks).toHaveLength(1)
    expect(decks[0]).toMatchObject({
      id: 'deck-1',
      title: 'Seed round',
      slideCount: 8,
      cover: { html: '<div class="slide"></div>' },
      // Full surname is never sent to the public page.
      author: { name: 'Dana W.', initials: 'DW' },
    })
  })

  it('listPublicDecks() omits the byline when the account has no name', async () => {
    const { mod } = await loadDb((sql) =>
      sql.includes('FROM decks')
        ? [{
            id: 'deck-2',
            title: 'Untitled deck',
            slide_count: 3,
            theme: {},
            cover: { html: '<div class="slide"></div>' },
            updated_at: '2026-11-15T00:00:00Z',
            first_name: null,
            last_name: null,
          }]
        : [],
    )

    const [deck] = await mod.listPublicDecks(6)
    expect(deck.author).toBeNull()
  })

  it('setDeckPublic() lists a owned deck and returns null for a foreign one', async () => {
    const { mod, captured } = await loadDb((sql) =>
      sql.includes('UPDATE decks') ? [{ is_public: true }] : [],
    )

    await expect(mod.setDeckPublic('deck-1', 'user-1', true)).resolves.toEqual({
      isPublic: true,
    })
    const query = captured.find((q) => q.sql.includes('UPDATE decks'))
    expect(query.sql).toContain('SET is_public = $3')
    expect(query.sql).toContain('WHERE id = $1 AND user_id = $2')
    expect(query.params).toEqual(['deck-1', 'user-1', true])

    const foreign = await loadDb(() => [])
    await expect(
      foreign.mod.setDeckPublic('deck-2', 'user-1', true),
    ).resolves.toBeNull()
  })
})
