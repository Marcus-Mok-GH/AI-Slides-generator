/**
 * Single source of truth for the API entrypoint.
 *
 * `api/index.cjs` is generated from this file by `scripts/build-api.mjs` and
 * that generated bundle is what Vercel deploys as a function. Bundling first
 * avoids a whole class of serverless failures: the platform's runtime decides
 * whether a file is ESM or CommonJS when it loads it, and for anything outside
 * the entry file that decision kept going wrong here ("Cannot use import
 * statement outside a module"). One self-contained CJS file has nothing left
 * to interpret.
 *
 * Locally this file also starts a listening server for `npm run dev`.
 */
import app from '../api/_lib/app.js'

const isVercel = Boolean(process.env.VERCEL)

if (!isVercel) {
  const PORT = process.env.SERVER_PORT || 3001
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[server] listening on http://127.0.0.1:${PORT}`)
  })
}

export default app
