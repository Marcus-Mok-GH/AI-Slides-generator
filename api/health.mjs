export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    dbConfigured: Boolean(process.env.POSTGRES_URL),
    jwtConfigured: Boolean(process.env.JWT_SECRET),
  })
}