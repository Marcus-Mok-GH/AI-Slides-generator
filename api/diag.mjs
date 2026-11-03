/**
 * Runtime self-check.
 *
 * A serverless function that throws while its module graph is being evaluated
 * returns a bare "500 FUNCTION_INVOCATION_FAILED" with no stack trace, which
 * makes debugging from the outside close to impossible. This endpoint imports
 * dependencies one at a time inside try/catch blocks and reports what the
 * runtime can and cannot see, so a broken deploy explains itself.
 *
 *   GET /api/diag          → environment, dependency and filesystem report
 *   GET /api/diag?db=1     → also runs SELECT NOW() through the real driver
 */
import fs from 'node:fs'

const PACKAGES = [
  'express',
  'pg',
  'ws',
  '@neondatabase/serverless',
  'bcryptjs',
  'jsonwebtoken',
  'pptxgenjs',
  'jspdf',
  'puppeteer',
]

function listDir(dir) {
  try {
    return fs.readdirSync(dir).slice(0, 40)
  } catch (err) {
    return `${err.code || 'ERROR'}: ${err.message}`
  }
}

async function probe(name) {
  try {
    await import(name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 300), code: err?.code || null }
  }
}

export default async function handler(req, res) {
  const key = process.env.DIAG_KEY
  if (key && req.query?.key !== key) {
    return res.status(401).json({ error: 'Provide ?key=' })
  }

  const packages = {}
  for (const name of PACKAGES) {
    packages[name] = await probe(name)
  }

  const report = {
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    env: {
      dbUrl: Boolean(
        process.env.POSTGRES_URL ||
          process.env.DATABASE_URL ||
          process.env.POSTGRES_PRISMA_URL ||
          process.env.POSTGRES_URL_NON_POOLING,
      ),
      jwtSecret: Boolean(process.env.JWT_SECRET),
    },
    packages,
    note: 'Packages listed as missing are simply not imported by this function; each Vercel function only ships the dependencies it requires.',
    ok: true,
  }

  if (req.query?.full) {
    report.fs = {
      cwd: process.cwd(),
      cwdEntries: listDir(process.cwd()),
      apiEntries: listDir(`${process.cwd()}/api`),
      nodeModulesCount: (() => {
        const entries = listDir(`${process.cwd()}/node_modules`)
        return Array.isArray(entries) ? entries.length : entries
      })(),
    }
  }

  if (req.query?.db) {
    try {
      const { getPool } = await import('../server/db.js')
      const pool = await getPool()
      const { rows } = await pool.query('SELECT NOW() AS now')
      report.dbNow = rows?.[0]?.now ?? null
    } catch (err) {
      report.dbError = String(err?.message || err).slice(0, 300)
    }
  }

  res.status(200).json(report)
}