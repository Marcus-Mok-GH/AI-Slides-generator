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
 * Initial credit grants (in cents).
 *   NEW_USER_CENTS — handed to anyone signing up after the credits column
 *     exists. Currently $5 (= 500 cents).
 *   LEGACY_USER_CENTS — one-time backfill for users that already existed
 *     before we shipped credits. Currently $100 (= 10 000 cents).
 *
 * Per-deck price is `DECK_GENERATION_CENTS` (50¢). Tweak both as needed.
 */
export const NEW_USER_CENTS = 500
export const LEGACY_USER_CENTS = 10000
export const DECK_GENERATION_CENTS = 50

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

  // ---------- Credits column + one-time legacy backfill ----------
  // Add the column nullable first so we can tell legacy rows apart from
  // freshly inserted ones. Anyone already in `users` at this point predates
  // the credits feature and gets the higher legacy grant; new sign-ups get
  // the smaller starter grant via the column default below.
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS credits_cents INTEGER;
  `)
  await pool.query(
    `UPDATE users SET credits_cents = $1 WHERE credits_cents IS NULL`,
    [LEGACY_USER_CENTS],
  )
  // Now lock in the new-user default so future inserts that omit the column
  // automatically get the starter grant.
  await pool.query(
    `ALTER TABLE users ALTER COLUMN credits_cents SET DEFAULT ${NEW_USER_CENTS}`,
  )
  await pool.query(
    `ALTER TABLE users ALTER COLUMN credits_cents SET NOT NULL`,
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
  if (!id) throw new Error('upsertUser: id is required')

  // The `email` column has a UNIQUE constraint, so an INSERT can fail two
  // ways: (a) a row already exists with the same id (re-login — handled by
  // ON CONFLICT (id)), or (b) a row exists with the same email but a
  // *different* id. Case (b) happens when the Supabase auth user was
  // recreated (e.g. project reset, account deletion + re-signup) while our
  // local row stuck around. If we don't handle it, the INSERT throws
  // "duplicate key violates users_email_key", no local row is written for
  // the new auth id, and every authenticated query for that user returns
  // empty — the UI looks signed in to Supabase but can't load anything.
  //
  // Resolution: if a row exists for this email under a stale id, re-key it
  // to the new auth id. That preserves the user's credits, decks, and any
  // other data tied to the old id.
  if (email) {
    await pool.query(
      `UPDATE users
         SET id = $1, updated_at = NOW()
       WHERE email = $2 AND id <> $1`,
      [id, email],
    )
  }

  // Don't touch credits_cents in the UPDATE branch — only the INSERT path
  // grants the starter balance via the column default. Subsequent logins
  // must never reset the running balance.
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email             = EXCLUDED.email,
       first_name        = EXCLUDED.first_name,
       last_name         = EXCLUDED.last_name,
       profile_image_url = EXCLUDED.profile_image_url,
       updated_at        = NOW()
     RETURNING id, email, first_name, last_name, profile_image_url, credits_cents`,
    [id, email, firstName, lastName, profileImageUrl],
  )
  return rows[0]
}

/* ---------------- credits ---------------- */

/**
 * Read the current balance for a user (in cents). Returns 0 if the user
 * is unknown — callers should treat that as "not enough" without crashing.
 */
export async function getCredits(userId) {
  if (!userId) return 0
  const { rows } = await pool.query(
    `SELECT credits_cents FROM users WHERE id = $1`,
    [userId],
  )
  return rows[0]?.credits_cents ?? 0
}

/**
 * Atomically deduct `amountCents` from the user's balance. Returns the new
 * balance, or `null` if the user didn't have enough (no row updated).
 * Use this AFTER you've delivered the work — pre-check with `getCredits`
 * to surface "out of credits" early without rolling back side effects.
 */
export async function deductCredits(userId, amountCents) {
  if (!userId || !Number.isFinite(amountCents) || amountCents <= 0) return null
  const { rows } = await pool.query(
    `UPDATE users
     SET credits_cents = credits_cents - $2,
         updated_at    = NOW()
     WHERE id = $1 AND credits_cents >= $2
     RETURNING credits_cents`,
    [userId, Math.round(amountCents)],
  )
  if (!rows.length) return null
  return rows[0].credits_cents
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

/* ---------------- agent_chats ---------------- */

export async function migrateAgentChats() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_chats (
      id         VARCHAR PRIMARY KEY,
      user_id    VARCHAR NOT NULL,
      title      VARCHAR,
      messages   JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_agent_chats_user_updated
     ON agent_chats (user_id, updated_at DESC);`,
  )
}

export async function listAgentChats(userId, limit = 40) {
  if (!userId) return []
  const { rows } = await pool.query(
    `SELECT id, title, created_at, updated_at
     FROM agent_chats
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function getAgentChat(id, userId) {
  if (!userId) return null
  const { rows } = await pool.query(
    `SELECT id, title, messages, created_at, updated_at
     FROM agent_chats
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (!rows.length) return null
  return {
    id: rows[0].id,
    title: rows[0].title,
    messages: rows[0].messages || [],
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  }
}

export async function createAgentChat(userId, title, messages = []) {
  if (!userId) throw new Error('createAgentChat requires userId')
  const id = await generateId()
  await pool.query(
    `INSERT INTO agent_chats (id, user_id, title, messages)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [id, userId, title || 'New chat', JSON.stringify(messages)],
  )
  return id
}

export async function updateAgentChat(id, userId, { title, messages } = {}) {
  if (!userId) return
  const sets = []
  const vals = [id, userId]
  if (title !== undefined) { sets.push(`title = $${vals.length + 1}`); vals.push(title) }
  if (messages !== undefined) { sets.push(`messages = $${vals.length + 1}::jsonb`); vals.push(JSON.stringify(messages)) }
  sets.push('updated_at = NOW()')
  if (sets.length === 1) return
  await pool.query(
    `UPDATE agent_chats SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
    vals,
  )
}

export async function deleteAgentChat(id, userId) {
  if (!userId) return
  await pool.query(`DELETE FROM agent_chats WHERE id = $1 AND user_id = $2`, [id, userId])
}

/* ---------------- generation_jobs ---------------- */

export async function migrateGenerationJobs() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id         VARCHAR PRIMARY KEY,
      user_id    VARCHAR NOT NULL,
      status     VARCHAR NOT NULL DEFAULT 'pending',
      events     JSONB    NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_user
    ON generation_jobs (user_id, created_at DESC);
  `)
}

export async function createGenerationJob(id, userId) {
  await pool.query(
    `INSERT INTO generation_jobs (id, user_id, status, events)
     VALUES ($1, $2, 'pending', '[]')`,
    [id, userId],
  )
}

export async function appendJobEvent(jobId, event, data) {
  await pool.query(
    `UPDATE generation_jobs
     SET events     = events || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([{ event, data }]), jobId],
  )
}

export async function updateJobStatus(jobId, status) {
  await pool.query(
    `UPDATE generation_jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, jobId],
  )
}

export async function getGenerationJob(jobId, userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, status, events, created_at
     FROM generation_jobs WHERE id = $1`,
    [jobId],
  )
  if (!rows.length) return null
  const job = rows[0]
  if (job.user_id !== userId) return null
  return job
}

export async function pruneGenerationJobs() {
  await pool.query(
    `DELETE FROM generation_jobs
     WHERE status IN ('completed', 'failed')
       AND created_at < NOW() - INTERVAL '24 hours'`,
  )
}
