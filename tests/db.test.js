/**
 * Tests for api/db.js (and server/db.js which is identical).
 *
 * PR changes covered:
 *  - @neondatabase/serverless Pool (NeonPool) is used for Neon connections
 *  - neonConfig.webSocketConstructor is set to ws for Neon connections
 *  - Supabase connections use pg Pool with SSL; Neon connections do NOT get SSL
 *  - Plain PostgreSQL connections use pg Pool without SSL
 *  - Missing DATABASE_URL yields a mock pool
 *  - migrate() now executes consolidated multi-statement queries
 *  - migratePromptHistory(), migrateAgentChats(), migrateAgentPlans(),
 *    migrateGenerationJobs() inline the ALTER TABLE statements in the
 *    CREATE TABLE query block instead of issuing separate pool.query() calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a pool-like mock instance with spied query, on, end methods.
 * The returned object is shared across all constructor calls so we can
 * inspect calls later.
 */
function makePoolInstance() {
  return {
    on: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  }
}

/**
 * Create a constructor spy that returns `instance` when called with `new`.
 * Uses a regular function (not an arrow function) so it works as a constructor.
 */
function makePoolConstructorSpy(instance) {
  const calls = []
  function PoolSpy(opts) {
    // Push as [args] array to match vitest/jest convention: mock.calls[i][j]
    calls.push([opts])
    return instance
  }
  // Attach a mock.calls equivalent so tests can use pgPoolSpy.mock.calls[0][0]
  PoolSpy.mock = { calls }
  return PoolSpy
}

/**
 * Load a fresh copy of api/db.js with specific env vars and mocked deps.
 * Returns { module, mocks } where mocks contains the spies.
 */
async function loadDbModule(envVars = {}) {
  vi.resetModules()

  const savedEnv = { ...process.env }

  // Clear all DB-related env vars, then apply overrides
  delete process.env.POSTGRES_URL
  delete process.env.SUPABASE_DATABASE_URL
  delete process.env.DATABASE_URL
  Object.assign(process.env, envVars)

  const pgPoolInstance = makePoolInstance()
  const pgPoolSpy = makePoolConstructorSpy(pgPoolInstance)

  const neonPoolInstance = makePoolInstance()
  const neonPoolSpy = makePoolConstructorSpy(neonPoolInstance)

  const neonConfigMock = {}
  const wsMock = {}

  vi.doMock('pg', () => ({
    default: { Pool: pgPoolSpy },
  }))

  vi.doMock('@neondatabase/serverless', () => ({
    Pool: neonPoolSpy,
    neonConfig: neonConfigMock,
  }))

  vi.doMock('ws', () => ({ default: wsMock }))

  const mod = await import('../api/db.js')

  // Restore env
  process.env = savedEnv

  return {
    module: mod,
    mocks: {
      pgPoolSpy,
      pgPoolInstance,
      neonPoolSpy,
      neonPoolInstance,
      neonConfigMock,
      wsMock,
    },
  }
}

// ---------------------------------------------------------------------------
// Pool selection
// ---------------------------------------------------------------------------

describe('Pool selection', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('uses NeonPool when connection string contains neon.tech', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb',
    })

    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(0)
  })

  it('uses NeonPool when POSTGRES_URL matches neon.tech (Vercel Storage)', async () => {
    const { mocks } = await loadDbModule({
      POSTGRES_URL: 'postgres://user:pass@ep-fast-12345.us-east-1.aws.neon.tech/verceldb',
    })

    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(0)
  })

  it('uses pg Pool when connection string contains supabase.co', async () => {
    const { mocks } = await loadDbModule({
      SUPABASE_DATABASE_URL:
        'postgres://user:pass@db.projectid.supabase.co:5432/postgres',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(0)
  })

  it('uses pg Pool when connection string contains supabase.com', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@db.projectid.supabase.com:5432/postgres',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(0)
  })

  it('uses pg Pool for plain PostgreSQL connection string', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(0)
  })

  it('uses mock pool (no real Pool) when no DATABASE_URL is set', async () => {
    const { mocks, module } = await loadDbModule({})

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(0)
    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(0)
    expect(module.hasDb).toBe(false)
  })

  it('exports hasDb=true when DATABASE_URL is provided', async () => {
    const { module } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })

    expect(module.hasDb).toBe(true)
  })

  it('exports hasDb=false when no connection string is present', async () => {
    const { module } = await loadDbModule({})

    expect(module.hasDb).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// NeonPool configuration (no SSL, correct pool options)
// ---------------------------------------------------------------------------

describe('NeonPool configuration', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('does NOT pass ssl option to NeonPool', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb',
    })

    const callArgs = mocks.neonPoolSpy.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('ssl')
  })

  it('passes correct connection options to NeonPool', async () => {
    const connStr = 'postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb'
    const { mocks } = await loadDbModule({ DATABASE_URL: connStr })

    const callArgs = mocks.neonPoolSpy.mock.calls[0][0]
    expect(callArgs.connectionString).toBe(connStr)
    expect(callArgs.max).toBe(10)
    expect(callArgs.idleTimeoutMillis).toBe(20_000)
    expect(callArgs.connectionTimeoutMillis).toBe(5_000)
  })

  it('does NOT pass maxUses to NeonPool', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb',
    })

    const callArgs = mocks.neonPoolSpy.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('maxUses')
  })
})

// ---------------------------------------------------------------------------
// neonConfig.webSocketConstructor setup
// ---------------------------------------------------------------------------

describe('neonConfig WebSocket setup', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('sets neonConfig.webSocketConstructor to ws for Neon connections', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb',
    })

    expect(mocks.neonConfigMock.webSocketConstructor).toBe(mocks.wsMock)
  })

  it('does NOT set neonConfig.webSocketConstructor for Supabase connections', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@db.abc.supabase.co:5432/postgres',
    })

    expect(mocks.neonConfigMock.webSocketConstructor).toBeUndefined()
  })

  it('does NOT set neonConfig.webSocketConstructor for plain PG connections', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })

    expect(mocks.neonConfigMock.webSocketConstructor).toBeUndefined()
  })

  it('does NOT set neonConfig.webSocketConstructor when no DATABASE_URL', async () => {
    const { mocks } = await loadDbModule({})

    expect(mocks.neonConfigMock.webSocketConstructor).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// pg Pool SSL configuration
// ---------------------------------------------------------------------------

describe('pg Pool SSL configuration', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('passes ssl: { rejectUnauthorized: false } to Pool for Supabase connections', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@db.abc.supabase.co:5432/postgres',
    })

    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('does NOT pass ssl option to Pool for plain PostgreSQL connections', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })

    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.ssl).toBeUndefined()
  })

  it('pg Pool receives maxUses option (for serverless connection management)', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })

    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.maxUses).toBe(7500)
  })

  it('pg Pool receives correct connection options', async () => {
    const connStr = 'postgres://user:pass@localhost:5432/mydb'
    const { mocks } = await loadDbModule({ DATABASE_URL: connStr })

    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.connectionString).toBe(connStr)
    expect(callArgs.max).toBe(10)
    expect(callArgs.idleTimeoutMillis).toBe(20_000)
    expect(callArgs.connectionTimeoutMillis).toBe(5_000)
  })
})

// ---------------------------------------------------------------------------
// Mock pool (no DATABASE_URL)
// ---------------------------------------------------------------------------

describe('Mock pool behaviour when no DATABASE_URL', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('pool.query resolves with { rows: [] }', async () => {
    const { module } = await loadDbModule({})

    const result = await module.pool.query('SELECT 1')
    expect(result).toEqual({ rows: [] })
  })

  it('pool.end resolves without error', async () => {
    const { module } = await loadDbModule({})

    await expect(module.pool.end()).resolves.toBeUndefined()
  })

  it('pool.on is a no-op function', async () => {
    const { module } = await loadDbModule({})

    expect(() => module.pool.on('error', () => {})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Helper: set up DB module with a capturing pool for migration tests
// ---------------------------------------------------------------------------

async function loadDbModuleWithCapture(envVars = {}) {
  vi.resetModules()

  const savedEnv = { ...process.env }
  delete process.env.POSTGRES_URL
  delete process.env.SUPABASE_DATABASE_URL
  delete process.env.DATABASE_URL
  Object.assign(process.env, envVars)

  const capturedQueries = []

  const poolInstance = {
    on: vi.fn(),
    query: vi.fn().mockImplementation((sql) => {
      capturedQueries.push(typeof sql === 'string' ? sql : String(sql))
      return Promise.resolve({ rows: [] })
    }),
    end: vi.fn().mockResolvedValue(undefined),
  }

  // Regular function so it works as a constructor
  function PoolSpy(opts) {
    return poolInstance
  }

  vi.doMock('pg', () => ({ default: { Pool: PoolSpy } }))
  vi.doMock('@neondatabase/serverless', () => ({
    Pool: PoolSpy,
    neonConfig: {},
  }))
  vi.doMock('ws', () => ({ default: {} }))

  const mod = await import('../api/db.js')

  process.env = savedEnv

  return { module: mod, capturedQueries, poolInstance }
}

// ---------------------------------------------------------------------------
// migrate() — consolidated multi-statement query structure
// ---------------------------------------------------------------------------

describe('migrate() — consolidated SQL queries', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('executes users CREATE TABLE and ALTER TABLE in a single query call', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const usersCreateCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS users') &&
        q.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash'),
    )
    expect(usersCreateCall).toBeDefined()
  })

  it('users CREATE TABLE query includes all new column ALTER statements', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const usersCreateCall = capturedQueries.find(
      (q) => q.includes('CREATE TABLE IF NOT EXISTS users'),
    )
    expect(usersCreateCall).toBeDefined()
    expect(usersCreateCall).toContain('ADD COLUMN IF NOT EXISTS password_hash')
    expect(usersCreateCall).toContain('ADD COLUMN IF NOT EXISTS credits_cents')
    expect(usersCreateCall).toContain('ADD COLUMN IF NOT EXISTS metadata')
    expect(usersCreateCall).toContain('ADD COLUMN IF NOT EXISTS preferences')
    expect(usersCreateCall).toContain('ADD COLUMN IF NOT EXISTS last_login_at')
    expect(usersCreateCall).toContain('ALTER COLUMN created_at TYPE TIMESTAMPTZ')
    expect(usersCreateCall).toContain('ALTER COLUMN updated_at TYPE TIMESTAMPTZ')
  })

  it('credits_cents constraint query is a single consolidated statement', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const { NEW_USER_CENTS } = module
    // All three statements should be in ONE query call
    const creditsCall = capturedQueries.find(
      (q) =>
        q.includes('ALTER COLUMN credits_cents SET DEFAULT') &&
        q.includes(`UPDATE users SET credits_cents = ${NEW_USER_CENTS}`) &&
        q.includes('ALTER COLUMN credits_cents SET NOT NULL'),
    )
    expect(creditsCall).toBeDefined()
  })

  it('credits_cents backfill uses literal value (not bind param) in consolidated query', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const { NEW_USER_CENTS } = module
    const creditsCall = capturedQueries.find(
      (q) => q.includes('ALTER COLUMN credits_cents SET DEFAULT'),
    )
    // Verify it uses the literal NEW_USER_CENTS value, not a $1 bind param
    expect(creditsCall).toContain(`credits_cents = ${NEW_USER_CENTS} WHERE credits_cents IS NULL`)
    expect(creditsCall).not.toContain('credits_cents = $1')
  })

  it('decks CREATE TABLE and ALTER TABLE columns are in a single query call', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const decksCreateCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS decks') &&
        q.includes('ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id'),
    )
    expect(decksCreateCall).toBeDefined()
  })

  it('decks CREATE TABLE query includes TIMESTAMPTZ column alterations', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrate()

    const decksCreateCall = capturedQueries.find(
      (q) => q.includes('CREATE TABLE IF NOT EXISTS decks'),
    )
    expect(decksCreateCall).toBeDefined()
    expect(decksCreateCall).toContain('ADD COLUMN IF NOT EXISTS user_id')
    expect(decksCreateCall).toContain('ALTER COLUMN created_at TYPE TIMESTAMPTZ')
    expect(decksCreateCall).toContain('ALTER COLUMN updated_at TYPE TIMESTAMPTZ')
  })

  it('migrate() skips execution and returns undefined when hasDb is false', async () => {
    const { module } = await loadDbModuleWithCapture({})

    await expect(module.migrate()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// migratePromptHistory() — ALTER TABLE inlined in CREATE TABLE query
// ---------------------------------------------------------------------------

describe('migratePromptHistory() — consolidated SQL', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('inlines ALTER COLUMN used_at TYPE TIMESTAMPTZ in the CREATE TABLE query', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migratePromptHistory()

    const createCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS prompt_history') &&
        q.includes('ALTER TABLE prompt_history ALTER COLUMN used_at TYPE TIMESTAMPTZ'),
    )
    expect(createCall).toBeDefined()
  })

  it('does not issue a separate standalone ALTER TABLE query for used_at', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migratePromptHistory()

    // The ALTER TABLE for used_at should NOT appear as a standalone query
    // (i.e. a query that contains ONLY the ALTER statement, not wrapped in a CREATE TABLE)
    const standaloneAlter = capturedQueries.filter(
      (q) => q.includes('ALTER TABLE prompt_history ALTER COLUMN used_at TYPE TIMESTAMPTZ'),
    )
    // All occurrences must also contain the CREATE TABLE statement
    for (const q of standaloneAlter) {
      expect(q).toContain('CREATE TABLE IF NOT EXISTS prompt_history')
    }
  })

  it('skips when no DATABASE_URL is set', async () => {
    const { module } = await loadDbModuleWithCapture({})

    await expect(module.migratePromptHistory()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// migrateAgentChats() — ALTER TABLE inlined in CREATE TABLE query
// ---------------------------------------------------------------------------

describe('migrateAgentChats() — consolidated SQL', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('inlines both ALTER COLUMN TIMESTAMPTZ statements in the CREATE TABLE query', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateAgentChats()

    const createCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS agent_chats') &&
        q.includes('ALTER TABLE agent_chats ALTER COLUMN created_at TYPE TIMESTAMPTZ') &&
        q.includes('ALTER TABLE agent_chats ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    expect(createCall).toBeDefined()
  })

  it('does not issue separate ALTER TABLE queries for timestamp columns', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateAgentChats()

    // Any query containing the timestamp ALTER must also have the CREATE TABLE
    const alterQueries = capturedQueries.filter(
      (q) =>
        q.includes('ALTER TABLE agent_chats ALTER COLUMN created_at TYPE TIMESTAMPTZ') ||
        q.includes('ALTER TABLE agent_chats ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    for (const q of alterQueries) {
      expect(q).toContain('CREATE TABLE IF NOT EXISTS agent_chats')
    }
  })

  it('skips when no DATABASE_URL is set', async () => {
    const { module } = await loadDbModuleWithCapture({})

    await expect(module.migrateAgentChats()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// migrateAgentPlans() — ALTER TABLE inlined in CREATE TABLE query
// ---------------------------------------------------------------------------

describe('migrateAgentPlans() — consolidated SQL', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('inlines both ALTER COLUMN TIMESTAMPTZ statements in the CREATE TABLE query', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateAgentPlans()

    const createCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS agent_plans') &&
        q.includes('ALTER TABLE agent_plans ALTER COLUMN created_at TYPE TIMESTAMPTZ') &&
        q.includes('ALTER TABLE agent_plans ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    expect(createCall).toBeDefined()
  })

  it('does not issue separate ALTER TABLE queries for timestamp columns', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateAgentPlans()

    const alterQueries = capturedQueries.filter(
      (q) =>
        q.includes('ALTER TABLE agent_plans ALTER COLUMN created_at TYPE TIMESTAMPTZ') ||
        q.includes('ALTER TABLE agent_plans ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    for (const q of alterQueries) {
      expect(q).toContain('CREATE TABLE IF NOT EXISTS agent_plans')
    }
  })

  it('skips when no DATABASE_URL is set', async () => {
    const { module } = await loadDbModuleWithCapture({})

    await expect(module.migrateAgentPlans()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// migrateGenerationJobs() — ALTER TABLE inlined in CREATE TABLE query
// ---------------------------------------------------------------------------

describe('migrateGenerationJobs() — consolidated SQL', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('inlines both ALTER COLUMN TIMESTAMPTZ statements in the CREATE TABLE query', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateGenerationJobs()

    const createCall = capturedQueries.find(
      (q) =>
        q.includes('CREATE TABLE IF NOT EXISTS generation_jobs') &&
        q.includes('ALTER TABLE generation_jobs ALTER COLUMN created_at TYPE TIMESTAMPTZ') &&
        q.includes('ALTER TABLE generation_jobs ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    expect(createCall).toBeDefined()
  })

  it('does not issue separate ALTER TABLE queries for timestamp columns', async () => {
    const { module, capturedQueries } = await loadDbModuleWithCapture({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mydb',
    })
    await module.migrateGenerationJobs()

    const alterQueries = capturedQueries.filter(
      (q) =>
        q.includes('ALTER TABLE generation_jobs ALTER COLUMN created_at TYPE TIMESTAMPTZ') ||
        q.includes('ALTER TABLE generation_jobs ALTER COLUMN updated_at TYPE TIMESTAMPTZ'),
    )
    for (const q of alterQueries) {
      expect(q).toContain('CREATE TABLE IF NOT EXISTS generation_jobs')
    }
  })

  it('skips when no DATABASE_URL is set', async () => {
    const { module } = await loadDbModuleWithCapture({})

    await expect(module.migrateGenerationJobs()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Connection string detection — boundary / regression cases
// ---------------------------------------------------------------------------

describe('Connection string detection — boundary / regression cases', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('detects neon.tech regardless of subdomain depth', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://u:p@ep-some-name-12345678.ap-southeast-1.aws.neon.tech/db',
    })

    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(0)
  })

  it('detects supabase.co with case-insensitive match', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://u:p@db.abc123.Supabase.CO:5432/postgres',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('a URL containing "neon" but not "neon.tech" does NOT trigger NeonPool', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://u:p@neon-backup.mycompany.com:5432/mydb',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    expect(mocks.neonPoolSpy.mock.calls).toHaveLength(0)
  })

  it('prefers POSTGRES_URL over SUPABASE_DATABASE_URL when both are set', async () => {
    const { module } = await loadDbModule({
      POSTGRES_URL: 'postgres://u:p@ep-xyz.us-east-2.aws.neon.tech/db',
      SUPABASE_DATABASE_URL: 'postgres://u:p@db.abc.supabase.co:5432/postgres',
    })

    expect(module.hasDb).toBe(true)
  })

  it('detects supabase.com (not just supabase.co)', async () => {
    const { mocks } = await loadDbModule({
      DATABASE_URL: 'postgres://u:p@db.project.supabase.com:5432/postgres',
    })

    expect(mocks.pgPoolSpy.mock.calls).toHaveLength(1)
    const callArgs = mocks.pgPoolSpy.mock.calls[0][0]
    expect(callArgs.ssl).toEqual({ rejectUnauthorized: false })
  })
})
