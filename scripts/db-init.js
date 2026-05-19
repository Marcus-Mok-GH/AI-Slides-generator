import { migrate, pool } from '../server/db.js'

async function init() {
  console.log('[db-init] starting schema migration...')
  const t0 = Date.now()
  try {
    await migrate()
    console.log(`[db-init] schema migration completed successfully in ${Date.now() - t0}ms`)
    process.exit(0)
  } catch (err) {
    console.error('[db-init] FATAL: schema migration failed')
    console.error(err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

init()
