/**
 * Vercel Serverless Entry Point
 *
 * Mounts all API routes under /api/* and serves as the root handler.
 * Uses Express with vercel-friendly patterns.
 */

const express = require('express');
const planRoutes = require('../server/routes/plan');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount plan routes at /api/agentfive
app.use('/api/agentfive', planRoutes);

// Root fallback
app.get('/', (req, res) => {
  res.json({
    name: 'AI Slides Generator',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/agentfive/plan',
      '/api/agentfive/plans',
      '/api/agentfive/plan/:planId',
      '/api/agentfive/plan/:planId/step/:stepId/approve',
      '/api/agentfive/plan/:planId/step/:stepId/reject',
      '/api/agentfive/plan/:planId/execute',
      '/api/agentfive/plan/:planId/step/:stepId/complete',
      '/api/agentfive/plan/:planId/step/:stepId/fail',
      '/api/agentfive/plan/:planId/replan'
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
