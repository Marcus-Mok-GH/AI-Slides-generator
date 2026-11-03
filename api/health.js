/**
 * Standalone health endpoint.
 *
 * Deliberately dependency-free: it never imports the Express app, the database
 * driver, or anything else that could fail to load, so it keeps answering even
 * when the main API function is unhealthy. That makes it the one reliable place
 * to see what the runtime actually has.
 */
export default function handler(req, res) {
  const hasDbUrl = Boolean(
    process.env.POSTGRES_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.DATABASE_URL,
  )

  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    dbConfigured: hasDbUrl,
    jwtConfigured: Boolean(process.env.JWT_SECRET),
  })
}