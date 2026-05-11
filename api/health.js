// Standalone health endpoint for Vercel serverless.
// Does NOT import from ../server/ or any sibling modules — fully self-contained.

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
};
