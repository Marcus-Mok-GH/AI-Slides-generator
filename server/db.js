import pg from 'pg'

const { Pool } = pg

// Prefer Supabase when configured; fall back to the Replit DATABASE_URL.
const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL

const isSupabase = /supabase\.(co|com)/i.test(connectionString || '')

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
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
 * Idempotent schema setup. Creates a `users` profile table mirroring the
 * Supabase auth user (one row per auth user) and the `decks` table scoped
 * to that user id. We do NOT create a sessions table — Supabase Auth
 * manages sessions client-side via JWTs.
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

export async function renameDeck(id, userId, newTitle) {
  if (!userId || !newTitle?.trim()) return
  await pool.query(
    `UPDATE decks
     SET title      = $3,
         data       = jsonb_set(data, '{title}', to_jsonb($3::text)),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [id, userId, newTitle.trim()],
  )
}

/* ---------------- prompt_history ---------------- */

export async function migratePromptHistory() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_history (
      id        SERIAL PRIMARY KEY,
      user_id   VARCHAR NOT NULL,
      prompt    TEXT    NOT NULL,
      format    VARCHAR,
      used_at   TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ph_user_used ON prompt_history (user_id, used_at DESC);`,
  )
}

export async function savePromptHistory(userId, prompt, format = null) {
  if (!userId || !prompt?.trim()) return
  const trimmed = prompt.trim()
  await pool.query(
    `INSERT INTO prompt_history (user_id, prompt, format, used_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [userId, trimmed, format],
  )
  await pool.query(
    `UPDATE prompt_history SET used_at = NOW(), format = $3
     WHERE user_id = $1 AND prompt = $2`,
    [userId, trimmed, format],
  )
  await pool.query(
    `DELETE FROM prompt_history
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM prompt_history
         WHERE user_id = $1
         ORDER BY used_at DESC
         LIMIT 20
       )`,
    [userId],
  )
}

export async function getPromptHistory(userId, limit = 15) {
  if (!userId) return []
  const { rows } = await pool.query(
    `SELECT id, prompt, format, used_at
     FROM prompt_history
     WHERE user_id = $1
     ORDER BY used_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    format: r.format,
    usedAt: r.used_at,
  }))
}

export async function deletePromptHistoryItem(id, userId) {
  if (!userId) return
  await pool.query(`DELETE FROM prompt_history WHERE id = $1 AND user_id = $2`, [id, userId])
}
