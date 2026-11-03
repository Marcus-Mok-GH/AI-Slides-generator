/**
 * Vercel serverless entry point.
 *
 * The Express app is loaded lazily, inside the handler, rather than with a
 * static `import`. Two reasons:
 *
 *   1. A static import that fails (missing dependency in the deployed bundle,
 *      incompatible native module, bad connection string) crashes the function
 *      during module evaluation. Vercel turns that into an opaque
 *      "A server error has occurred / FUNCTION_INVOCATION_FAILED" with no way
 *      to tell what actually broke.
 *   2. Loading it here means a failure is a normal 500 response with the real
 *      error message in it, so the app can be debugged from the browser.
 *
 * Locally (no VERCEL env var) it also starts a listening server for `npm run dev`.
 */
import { readdirSync, existsSync } from 'node:fs'

/** What the deployed bundle actually looks like — only used to explain a failed init. */
function runtimeContext() {
  try {
    const cwd = process.cwd()
    const list = (dir) => {
      try {
        return readdirSync(dir).slice(0, 25)
      } catch (err) {
        return err.code
      }
    }
    const exists = (p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    }
    return {
      cwd,
      node: process.version,
      cwdEntries: list(cwd),
      apiEntries: list(`${cwd}/api`),
      libEntries: list(`${cwd}/api/_lib`),
      rootPkg: exists(`${cwd}/package.json`),
      apiPkg: exists(`${cwd}/api/package.json`),
    }
  } catch (err) {
    return { error: err?.message || String(err) }
  }
}

let appPromise = null

function loadApp() {
  if (!appPromise) {
    appPromise = import('./_lib/app.js').then((mod) => mod.default)
  }
  return appPromise
}

export default async function handler(req, res) {
  try {
    const app = await loadApp()
    return app(req, res)
  } catch (err) {
    console.error('[api] failed to initialise Express app:', err)
    if (res.headersSent) return
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'API failed to initialise',
        code: err?.code || null,
        message: err?.message || String(err),
        missing: /Cannot find (package|module) '([^']+)'/.exec(err?.message || '')?.[2] || null,
        runtime: runtimeContext(),
      }),
    )
  }
}

const isVercel = process.env.VERCEL === '1'

if (!isVercel) {
  const PORT = process.env.SERVER_PORT || 3001
  loadApp()
    .then((app) => {
      app.listen(PORT, '127.0.0.1', () => {
        console.log(`[server] listening on http://127.0.0.1:${PORT}`)
      })
    })
    .catch((err) => {
      console.error('[server] failed to start:', err)
      process.exitCode = 1
    })
}