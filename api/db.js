import pg from 'pg'
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

const { Pool } = pg

// Support Neon (Vercel Storage), Supabase, or Replit PostgreSQL.
const connectionString =
  process.env.POSTGRES_URL || // Vercel Storage / Neon
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL

export const hasDb = Boolean(connectionString)
const isSupabase = hasDb && /supabase\.(co|com)/i.test(connectionString)
const isNeon = hasDb && /neon\.tech/i.test(connectionString)

// Configure Neon for serverless environments
if (isNeon) {
  neonConfig.webSocketConstructor = ws
}

function createMockPool() {
  const noop = async () => ({ rows: [] })
  const mock = {
    query: noop,
    on: () => {},
    end: async () => {},
  }
  return mock
}

export const pool = hasDb
  ? (isNeon
    ? new NeonPool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 5_000,
      })
    : new Pool({
        connectionString,
        ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
        max: 10, // Slightly higher for Neon/Vercel
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 5_000,
        maxUses: 7500, // Helps with long-running serverless connections
      }))
  : createMockPool()

if (hasDb) {
  pool.on('error', (err) => {
    console.error('[db] unexpected pool error:', err)
  })
} else {
  console.warn('[db] WARNING: DATABASE_URL is not set. Using no-op mock pool. DB-dependent routes will return 503.')
}

function dbRequired() {
  if (!hasDb) {
    const err = new Error('Database unavailable: DATABASE_URL is not configured')
    err.statusCode = 503
    throw err
  }
}

// Async-safe id generator (handles environments without globalThis.crypto)
export async function generateId() {
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
 * Idempotent schema setup. Creates and optimizes tables for Neon/Vercel Storage.
 * Uses TIMESTAMPTZ for timezone safety and explicit foreign keys.
 */
export async function migrate() {
  if (!hasDb) {
    console.warn('[db] migrate() skipped — no DATABASE_URL configured')
    return
  }

  // 1. Create/Update Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                 VARCHAR PRIMARY KEY,
      email              VARCHAR UNIQUE,
      first_name         VARCHAR,
      last_name          VARCHAR,
      profile_image_url  VARCHAR,
      password_hash      VARCHAR,
      credits_cents      INTEGER NOT NULL DEFAULT ${NEW_USER_CENTS},
      metadata           JSONB DEFAULT '{}',
      preferences        JSONB DEFAULT '{}',
      last_login_at      TIMESTAMPTZ,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_cents INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  `)

  // Legacy credits backfill: users existing before this column get LEGACY_USER_CENTS
  await pool.query(
    `UPDATE users SET credits_cents = $1 WHERE credits_cents IS NULL`,
    [LEGACY_USER_CENTS],
  )

  // Now set the default and NOT NULL constraint for future signups
  await pool.query(`
    ALTER TABLE users ALTER COLUMN credits_cents SET DEFAULT ${NEW_USER_CENTS};
    UPDATE users SET credits_cents = ${NEW_USER_CENTS} WHERE credits_cents IS NULL;
    ALTER TABLE users ALTER COLUMN credits_cents SET NOT NULL;
  `)

  // 2. Create/Update Decks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS decks (
      id          VARCHAR PRIMARY KEY,
      user_id     VARCHAR REFERENCES users(id) ON DELETE CASCADE,
      title       VARCHAR,
      subtitle    VARCHAR,
      slide_count INTEGER,
      theme       JSONB,
      data        JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id VARCHAR;
    ALTER TABLE decks ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE decks ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  `)

  // Attempt to add foreign key if missing
  try {
    await pool.query(`
      ALTER TABLE decks
      ADD CONSTRAINT fk_decks_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_decks_user constraint:', e.message)
      throw e
    }
  }

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_decks_user_id_updated_at
     ON decks (user_id, updated_at DESC);`,
  )

  // 3. Other tables
  await migratePromptHistory()
  await migrateAgentChats()
  await migrateAgentPlans()
  await migrateGenerationJobs()
}

/* ---------------- users ---------------- */

export async function upsertUser(user) {
  dbRequired()
  const { id, email, firstName, lastName, profileImageUrl } = user
  if (!id) throw new Error('upsertUser: id is required')

  if (email) {
    await pool.query(
      `UPDATE users
         SET id = $1, updated_at = NOW()
       WHERE email = $2 AND id <> $1`,
      [id, email],
    )
  }

  const { rows } = await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email             = EXCLUDED.email,
       first_name        = EXCLUDED.first_name,
       last_name         = EXCLUDED.last_name,
       profile_image_url = EXCLUDED.profile_image_url,
       updated_at        = NOW()
     RETURNING id, email, first_name, last_name, profile_image_url, credits_cents, metadata, preferences, last_login_at`,
    [id, email, firstName, lastName, profileImageUrl],
  )
  return rows[0]
}

export async function updateUserLastLogin(userId) {
  if (!userId) return
  dbRequired()
  await pool.query(
    `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [userId],
  )
}

export async function findUserByEmail(email) {
  dbRequired()
  const { rows } = await pool.query(
    `SELECT id, email, first_name, last_name, profile_image_url, credits_cents, password_hash, metadata, preferences, last_login_at
     FROM users WHERE email = $1`,
    [email],
  )
  return rows[0] || null
}

export async function createUser({ id, email, firstName, lastName, passwordHash }) {
  dbRequired()
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password_hash, credits_cents, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (email) DO UPDATE SET
       first_name   = EXCLUDED.first_name,
       last_name    = EXCLUDED.last_name,
       password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
       last_login_at = NOW(),
       updated_at   = NOW()
     RETURNING id, email, first_name, last_name, profile_image_url, credits_cents, metadata, preferences, last_login_at`,
    [id, email, firstName, lastName, passwordHash, NEW_USER_CENTS],
  )
  return rows[0]
}

/* ---------------- credits ---------------- */

export async function getCredits(userId) {
  if (!userId) return 0
  dbRequired()
  const { rows } = await pool.query(
    `SELECT credits_cents FROM users WHERE id = $1`,
    [userId],
  )
  return rows[0]?.credits_cents ?? 0
}

export async function deductCredits(userId, amountCents) {
  if (!userId || !Number.isFinite(amountCents) || amountCents <= 0) return null
  dbRequired()
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
  dbRequired()
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
  dbRequired()
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
  dbRequired()
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
  dbRequired()
  await pool.query(`DELETE FROM decks WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ])
}

export async function renameDeck(id, userId, newTitle) {
  if (!userId || !newTitle?.trim()) return
  dbRequired()
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
  if (!hasDb) {
    console.warn('[db] migratePromptHistory() skipped — no DATABASE_URL configured')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_history (
      id        SERIAL PRIMARY KEY,
      user_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prompt    TEXT    NOT NULL,
      format    VARCHAR,
      used_at   TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE prompt_history ALTER COLUMN used_at TYPE TIMESTAMPTZ;
  `)
  try {
    await pool.query(`
      ALTER TABLE prompt_history
      ADD CONSTRAINT fk_ph_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_ph_user constraint:', e.message)
      throw e
    }
  }
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ph_user_used ON prompt_history (user_id, used_at DESC);`,
  )
}

export async function savePromptHistory(userId, prompt, format = null) {
  if (!userId || !prompt?.trim()) return
  dbRequired()
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
  dbRequired()
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
  dbRequired()
  await pool.query(`DELETE FROM prompt_history WHERE id = $1 AND user_id = $2`, [id, userId])
}

/* ---------------- agent_chats ---------------- */

export async function migrateAgentChats() {
  if (!hasDb) {
    console.warn('[db] migrateAgentChats() skipped — no DATABASE_URL configured')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_chats (
      id         VARCHAR PRIMARY KEY,
      user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      VARCHAR,
      messages   JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE agent_chats ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE agent_chats ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  `)
  try {
    await pool.query(`
      ALTER TABLE agent_chats
      ADD CONSTRAINT fk_chats_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_chats_user constraint:', e.message)
      throw e
    }
  }
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_agent_chats_user_updated
     ON agent_chats (user_id, updated_at DESC);`,
  )
}

export async function createAgentChat(userId, title = 'New chat', messages = []) {
  if (!userId) throw new Error('createAgentChat requires userId')
  dbRequired()
  const id = await generateId()
  await pool.query(
    `INSERT INTO agent_chats (id, user_id, title, messages)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [id, userId, title, JSON.stringify(messages)],
  )
  return id
}

export async function listAgentChats(userId, limit = 50) {
  if (!userId) return []
  dbRequired()
  const { rows } = await pool.query(
    `SELECT id, title, messages, created_at, updated_at
     FROM agent_chats
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messages: r.messages,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function getAgentChat(id, userId) {
  if (!userId) return null
  dbRequired()
  const { rows } = await pool.query(
    `SELECT id, title, messages, created_at, updated_at
     FROM agent_chats
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    id: r.id,
    title: r.title,
    messages: r.messages,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function updateAgentChat(id, userId, { title, messages }) {
  if (!userId) return
  dbRequired()
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
  dbRequired()
  await pool.query(`DELETE FROM agent_chats WHERE id = $1 AND user_id = $2`, [id, userId])
}

/* ---------------- agent_plans ---------------- */

export async function migrateAgentPlans() {
  if (!hasDb) {
    console.warn('[db] migrateAgentPlans() skipped — no DATABASE_URL configured')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_plans (
      id           VARCHAR PRIMARY KEY,
      chat_id      VARCHAR NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
      user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_data    JSONB NOT NULL DEFAULT '{}',
      current_step INTEGER NOT NULL DEFAULT 0,
      status       VARCHAR NOT NULL DEFAULT 'planning',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE agent_plans ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE agent_plans ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  `)
  try {
    await pool.query(`
      ALTER TABLE agent_plans
      ADD CONSTRAINT fk_plans_chat
      FOREIGN KEY (chat_id) REFERENCES agent_chats(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_plans_chat constraint:', e.message)
      throw e
    }
  }
  try {
    await pool.query(`
      ALTER TABLE agent_plans
      ADD CONSTRAINT fk_plans_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_plans_user constraint:', e.message)
      throw e
    }
  }
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_agent_plans_user_updated
     ON agent_plans (user_id, updated_at DESC);`,
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_agent_plans_chat_id
     ON agent_plans (chat_id);`,
  )
}

export async function createPlan(chatId, userId, planData) {
  if (!chatId) throw new Error('createPlan requires chatId')
  if (!userId) throw new Error('createPlan requires userId')
  dbRequired()
  const id = await generateId()
  const { rows } = await pool.query(
    `INSERT INTO agent_plans (id, chat_id, user_id, plan_data, current_step, status)
     VALUES ($1, $2, $3, $4::jsonb, 0, 'planning')
     RETURNING id, chat_id, user_id, plan_data, current_step, status, created_at, updated_at`,
    [id, chatId, userId, JSON.stringify(planData || {})],
  )
  return rows[0]
}

export async function getPlanByChatId(chatId) {
  if (!chatId) return null
  dbRequired()
  const { rows } = await pool.query(
    `SELECT id, chat_id, user_id, plan_data, current_step, status, created_at, updated_at
     FROM agent_plans
     WHERE chat_id = $1`,
    [chatId],
  )
  if (!rows.length) return null
  return rows[0]
}

export async function updatePlanStatus(planId, status, currentStep) {
  if (!planId) return
  dbRequired()
  const sets = []
  const vals = [planId]
  if (status !== undefined) { sets.push(`status = $${vals.length + 1}`); vals.push(status) }
  if (currentStep !== undefined) { sets.push(`current_step = $${vals.length + 1}`); vals.push(currentStep) }
  sets.push('updated_at = NOW()')
  if (sets.length === 1) return
  await pool.query(
    `UPDATE agent_plans SET ${sets.join(', ')} WHERE id = $1`,
    vals,
  )
}

export async function getRecentPlans(userId, limit = 20) {
  if (!userId) return []
  dbRequired()
  const { rows } = await pool.query(
    `SELECT id, chat_id, user_id, plan_data, current_step, status, created_at, updated_at
     FROM agent_plans
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return rows
}

/* ---------------- generation_jobs ---------------- */

export async function migrateGenerationJobs() {
  if (!hasDb) {
    console.warn('[db] migrateGenerationJobs() skipped — no DATABASE_URL configured')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id         VARCHAR PRIMARY KEY,
      user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status     VARCHAR NOT NULL DEFAULT 'pending',
      events     JSONB    NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE generation_jobs ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE generation_jobs ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  `)
  try {
    await pool.query(`
      ALTER TABLE generation_jobs
      ADD CONSTRAINT fk_jobs_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `)
  } catch (e) {
    if (e.code !== '42710') {
      console.error('[db] Error adding fk_jobs_user constraint:', e.message)
      throw e
    }
  }
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_user
    ON generation_jobs (user_id, created_at DESC);
  `)
}

export async function createGenerationJob(id, userId) {
  dbRequired()
  await pool.query(
    `INSERT INTO generation_jobs (id, user_id, status, events)
     VALUES ($1, $2, 'pending', '[]')`,
    [id, userId],
  )
}

export async function appendJobEvent(jobId, event, data) {
  dbRequired()
  await pool.query(
    `UPDATE generation_jobs
     SET events     = events || $1::jsonb,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([{ event, data }]), jobId],
  )
}

export async function updateJobStatus(jobId, status) {
  dbRequired()
  await pool.query(
    `UPDATE generation_jobs SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, jobId],
  )
}

export async function getGenerationJob(jobId, userId) {
  dbRequired()
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

/* ---------------- public stats ---------------- */

export async function getPublicStats() {
  const BASE_TOTAL = parseInt(process.env.STATS_BASE_TOTAL  || '0', 10)
  const BASE_TODAY = parseInt(process.env.STATS_BASE_TODAY  || '0', 10)

  if (!hasDb) {
    return { total: BASE_TOTAL, today: BASE_TODAY }
  }

  const { rows } = await pool.query(`
    SELECT
      COUNT(*)                                              AS total,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)   AS today
    FROM decks
  `)
  return {
    total: (parseInt(rows[0].total, 10) || 0) + BASE_TOTAL,
    today: (parseInt(rows[0].today, 10) || 0) + BASE_TODAY,
  }
}

export async function pruneGenerationJobs() {
  if (!hasDb) return
  await pool.query(
    `DELETE FROM generation_jobs
     WHERE status IN ('completed', 'failed')
       AND created_at < NOW() - INTERVAL '24 hours'`,
  )
}
