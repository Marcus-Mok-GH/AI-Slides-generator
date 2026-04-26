import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err)
})

// Async-safe id generator (handles environments without globalThis.crypto)
async function generateId() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(9)
    globalThis.crypto.getRandomValues(bytes)
    return Buffer.from(bytes).toString('base64url')
  }
  const { webcrypto } = await import('node:crypto')
  const bytes = new Uint8Array(9)
  webcrypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function listDecks(limit = 24) {
  const { rows } = await pool.query(
    `SELECT id, title, subtitle, slide_count, theme, updated_at
     FROM decks
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    slideCount: r.slide_count,
    theme: r.theme,
    updatedAt: r.updated_at,
  }))
}

export async function getDeck(id) {
  const { rows } = await pool.query(
    `SELECT id, data, updated_at FROM decks WHERE id = $1`,
    [id],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return { ...row.data, id: row.id, updatedAt: row.updated_at }
}

export async function saveDeck(deck) {
  const id = deck.id || (await generateId())
  const { rows } = await pool.query(
    `INSERT INTO decks (id, title, subtitle, slide_count, theme, data)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       subtitle = EXCLUDED.subtitle,
       slide_count = EXCLUDED.slide_count,
       theme = EXCLUDED.theme,
       data = EXCLUDED.data,
       updated_at = NOW()
     RETURNING id, updated_at`,
    [
      id,
      deck.title || 'Untitled deck',
      deck.subtitle || '',
      Array.isArray(deck.slides) ? deck.slides.length : 0,
      JSON.stringify(deck.theme || {}),
      JSON.stringify({ ...deck, id }),
    ],
  )
  return { id: rows[0].id, updatedAt: rows[0].updated_at }
}

export async function deleteDeck(id) {
  await pool.query(`DELETE FROM decks WHERE id = $1`, [id])
}
