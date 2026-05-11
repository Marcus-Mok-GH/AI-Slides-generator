// Standalone health endpoint for Vercel serverless.
// Does NOT import from ../server/ or any sibling modules — fully self-contained.

module.exports = (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
}
