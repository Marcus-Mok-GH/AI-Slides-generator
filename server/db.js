import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
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

/**
 * Idempotent schema setup. Creates the users + sessions tables required by
 * Replit Auth, and adds the `user_id` column on the existing `decks` table
 * so each deck can be scoped to its owner.
 */
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                 VARCHAR PRIMARY KEY,
      email              VARCHAR UNIQUE,
      first_name         VARCHAR,
      last_name          VARCHAR,
      profile_image_url  VARCHAR,
      created_at         TIMESTAMP DEFAULT NOW(),
      updated_at         TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid    VARCHAR PRIMARY KEY,
      sess   JSONB   NOT NULL,
      expire TIMESTAMP NOT NULL
    );
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);`,
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS decks (
      id          VARCHAR PRIMARY KEY,
      title       VARCHAR,
      subtitle    VARCHAR,
      slide_count INTEGER,
      theme       JSONB,
      data        JSONB,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    );
  `)
  // Add user_id column to existing decks table (no-op on re-runs).
  await pool.query(`ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id VARCHAR;`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_decks_user_id_updated_at
     ON decks (user_id, updated_at DESC);`,
  )
}

/* ---------------- users ---------------- */

export async function upsertUser(user) {
  const { id, email, firstName, lastName, profileImageUrl } = user
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email             = EXCLUDED.email,
       first_name        = EXCLUDED.first_name,
       last_name         = EXCLUDED.last_name,
       profile_image_url = EXCLUDED.profile_image_url,
       updated_at        = NOW()
     RETURNING id, email, first_name, last_name, profile_image_url`,
    [id, email, firstName, lastName, profileImageUrl],
  )
  return rows[0]
}

/* ---------------- decks ---------------- */
//
// All deck queries below require a `userId`. The server is responsible for
// passing the authenticated user — there is no "global" deck namespace.

export async function listDecks(userId, limit = 24) {
  if (!userId) return []
  const { rows } = await pool.query(
    `SELECT id, title, subtitle, slide_count, theme, updated_at
     FROM decks
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
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

export async function getDeck(id, userId) {
  if (!userId) return null
  const { rows } = await pool.query(
    `SELECT id, data, updated_at
     FROM decks
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return { ...row.data, id: row.id, updatedAt: row.updated_at }
}

export async function saveDeck(deck, userId) {
  if (!userId) throw new Error('saveDeck requires userId')
  const id = deck.id || (await generateId())
  const { rows } = await pool.query(
    `INSERT INTO decks (id, user_id, title, subtitle, slide_count, theme, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       title       = EXCLUDED.title,
       subtitle    = EXCLUDED.subtitle,
       slide_count = EXCLUDED.slide_count,
       theme       = EXCLUDED.theme,
       data        = EXCLUDED.data,
       updated_at  = NOW()
     WHERE decks.user_id = EXCLUDED.user_id
     RETURNING id, updated_at`,
    [
      id,
      userId,
      deck.title || 'Untitled deck',
      deck.subtitle || '',
      Array.isArray(deck.slides) ? deck.slides.length : 0,
      JSON.stringify(deck.theme || {}),
      JSON.stringify({ ...deck, id }),
    ],
  )
  if (rows.length === 0) {
    // The id exists but belongs to another user — refuse.
    throw new Error('Deck already owned by another user')
  }
  return { id: rows[0].id, updatedAt: rows[0].updated_at }
}

export async function deleteDeck(id, userId) {
  if (!userId) return
  await pool.query(`DELETE FROM decks WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ])
}
