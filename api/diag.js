/**
 * Import probe / runtime self-check.
 *
 * On Vercel, anything that throws while a function's module graph is being
 * evaluated surfaces as an opaque "A server error has occurred /
 * FUNCTION_INVOCATION_FAILED" with no stack trace in the response. This
 * endpoint imports each module in the API graph one at a time and reports
 * which one fails, so a broken deployment can be diagnosed from the browser
 * instead of the Vercel dashboard.
 *
 * GET /api/diag          → import + environment report
 * GET /api/diag?db=1     → also runs `SELECT NOW()` through the real pool
 *
 * Set DIAG_KEY in the environment to require ?key=<value>.
 */

import fs from 'node:fs'
const PACKAGES = [
  'express',
  'pg',
  '@neondatabase/serverless',
  'ws',
  'bcryptjs',
  'jsonwebtoken',
  'pptxgenjs',
  'jspdf',
  'puppeteer',
]

const MODULES = [
  './_lib/jsonRepair.js',
  './_lib/streamParser.js',
  './_lib/db.js',
  './_lib/middleware/auth.js',
  './_lib/routes/auth.js',
  './_lib/generateDeck.js',
  './_lib/exportPptx.js',
  './_lib/exportPdf.js',
  './_lib/tools/browser.js',
  './_lib/agentFive.js',
  './_lib/app.js',
]

async function probe(loader) {
  try {
    await loader()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), code: err?.code || null }
  }
}

export default async function handler(req, res) {
  const key = process.env.DIAG_KEY
  if (key && req.query?.key !== key) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const report = {
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    env: {
      dbUrl: Boolean(process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL),
      jwtSecret: Boolean(process.env.JWT_SECRET),
    },
    packages: {},
    modules: {},
  }

  // Where is the code actually running, and what got deployed next to it?
  // Vercel traces node_modules per function; if a dependency is missing from
  // the bundle, every route that imports it dies at module evaluation.
  try {
    const fs = await import('node:fs')
    report.fs = { cwd: process.cwd() }
    for (const dir of ['/var/task', '/var/task/node_modules', '/var/task/api']) {
      try {
        const entries = fs.readdirSync(dir)
        report.fs[dir] = { count: entries.length, sample: entries.slice(0, 15) }
      } catch (err) {
        report.fs[dir] = { error: err?.code || String(err) }
      }
    }
    report.fs.packages = {}
    for (const name of PACKAGES) {
      report.fs.packages[name] = ['/var/task', '/var/task/api'].map((base) =>
        fs.existsSync(`${base}/node_modules/${name}/package.json`) ? base : null,
      ).filter(Boolean)
    }
  } catch (err) {
    report.fs = { error: err?.message || String(err) }
  }

  for (const name of PACKAGES) {
    report.packages[name] = await probe(() => import(name))
  }

  for (const name of MODULES) {
    report.modules[name] = await probe(() => import(name))
  }

  report.ok =
    Object.values(report.packages).every((r) => r.ok) &&
    Object.values(report.modules).every((r) => r.ok)

  if (req.query?.db === '1') {
    report.db = await probe(async () => {
      const { pool } = await import('./_lib/db.js')
      const { rows } = await pool.query('SELECT NOW() AS now')
      report.dbNow = rows?.[0]?.now ?? null
    })
  }


  report.runtime = {
    extensions: Object.keys(require.extensions || {}),
    entryFiles: (() => {
      try {
        return fs.readdirSync('/var/task/api')
      } catch (e) { return String(e.message) }
    })(),
    libFiles: (() => {
      try {
        return fs.readdirSync('/var/task/api/_lib')
      } catch (e) { return String(e.message) }
    })(),
    rootPkg: (() => {
      try { return fs.readFileSync('/var/task/package.json', 'utf8').slice(0, 400) }
      catch (e) { return String(e.message) }
    })(),
    apiPkg: (() => {
      try { return fs.readFileSync('/var/task/api/package.json', 'utf8').slice(0, 200) }
      catch (e) { return String(e.message) }
    })(),
  }

  res.status(200).json(report)
}