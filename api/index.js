/**
 * Vercel serverless entry point. We import the Express app (which doesn't
 * call .listen()) and either:
 *   - start a local HTTP server when running locally (dev mode), OR
 *   - default-export the app so Vercel's @vercel/node runtime can invoke
 *     it as a serverless function.
 */
import app from '../server/app.js'

const isVercel = process.env.VERCEL === '1'

if (!isVercel) {
  const PORT = process.env.SERVER_PORT || 3001
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[server] listening on http://127.0.0.1:${PORT}`)
  })
}

export default app
