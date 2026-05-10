/**
 * Vercel Serverless Entry Point
 *
 * Mounts all API routes under /api/* and serves as the root handler.
 * Uses Express with vercel-friendly patterns.
 */

const express = require('express');
const planRoutes = require('./routes/plan');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount plan routes at /api/agentfive
app.use('/api/agentfive', planRoutes);

// Root fallback - serve HTML landing page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Slides Generator</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      color: #e94560;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      width: 100%;
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #e94560, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: #a0a0a0;
      font-size: 1.1rem;
      margin-bottom: 30px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(0,255,0,0.1);
      color: #00ff88;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.9rem;
      margin-bottom: 30px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #00ff88;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .endpoints {
      background: rgba(0,0,0,0.2);
      border-radius: 12px;
      padding: 24px;
    }
    .endpoints h2 {
      color: #fff;
      font-size: 1.2rem;
      margin-bottom: 16px;
    }
    .endpoint {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .endpoint:last-child { border-bottom: none; }
    .method {
      font-size: 0.75rem;
      font-weight: bold;
      padding: 4px 8px;
      border-radius: 4px;
      min-width: 60px;
      text-align: center;
    }
    .method.get { background: #4CAF50; color: white; }
    .method.post { background: #2196F3; color: white; }
    .path {
      color: #ddd;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      color: #666;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 AI Slides Generator</h1>
    <p class="subtitle">Agent Five - Human-in-the-loop planning API</p>
    <div class="status">
      <span class="status-dot"></span>
      <span>API Online</span>
    </div>
    <div class="endpoints">
      <h2>Available Endpoints</h2>
      <div class="endpoint">
        <span class="method get">GET</span>
        <span class="path">/api/health</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/agentfive/plan</span>
      </div>
      <div class="endpoint">
        <span class="method get">GET</span>
        <span class="path">/api/agentfive/plans</span>
      </div>
      <div class="endpoint">
        <span class="method get">GET</span>
        <span class="path">/api/agentfive/plan/:planId</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/agentfive/plan/:planId/step/:stepId/approve</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/agentfive/plan/:planId/step/:stepId/reject</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/agentfive/plan/:planId/execute</span>
      </div>
      <div class="endpoint">
        <span class="method post">POST</span>
        <span class="path">/api/agentfive/plan/:planId/replan</span>
      </div>
    </div>
    <div class="footer">
      <p>AI Slides Generator v1.0.0 • Built with Express + Vercel</p>
    </div>
  </div>
</body>
</html>`);
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
