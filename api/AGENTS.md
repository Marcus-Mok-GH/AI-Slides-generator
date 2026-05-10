# API KNOWLEDGE BASE

**Generated:** 2026-04-30
**Directory:** /home/runner/workspace/api

## OVERVIEW
Serverless-compatible API wrapper for Vercel deployment. Acts as entry point that imports and starts the core Express backend.

## STRUCTURE
```
api/
└── index.js           # Vercel wrapper → server/app.js
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Serverless entry | `index.js` | Vercel wrapper, local dev server |
| Express app | `server/app.js` | Core backend (imported by wrapper) |

## CONVENTIONS

### Dual Entry Pattern
- **Vercel mode**: Exports handler for serverless functions
- **Local mode**: Starts HTTP server on port 3001
- **Imports**: Always imports `server/app.js` as core Express app

### Environment Detection
```javascript
if (process.env.VERCEL) {
  // Serverless: export handler
  module.exports = app;
} else {
  // Local: start server
  app.listen(3001);
}
```

## ANTI-PATTERNS (API)

- **NEVER modify server/app.js directly** → changes must go through wrapper
- **DO NOT hardcode ports** → use env vars for flexibility
- **Avoid bypassing wrapper** → all entry must go through api/index.js

## KEY FUNCTIONS

| Function | Purpose | Notes |
|----------|---------|-------|
| `handler()` | Vercel entry | Exported when VERCEL env detected |
| `app.listen()` | Local server | Port 3001 for dev |

## DEPLOYMENT NOTES

- **Vercel**: Deploys `api/index.js` as serverless function
- **Local**: Run `node api/index.js` to start dev server
- **Proxy**: Vite config proxies `/api` → `localhost:3001`

---

**Generated**: 2026-04-30
**Version**: 1.0
**Scope**: API directory