# SERVER KNOWLEDGE BASE

**Generated:** 2026-04-30
**Directory:** /home/runner/workspace/server

## OVERVIEW
Core Express backend for AI Slides Generator. Handles authentication, deck generation, database operations, and real-time streaming via SSE.

## STRUCTURE
```
server/
├── app.js              # Express app (routes, middleware)
├── auth.js             # Replit OIDC authentication
├── db.js               # PostgreSQL connection + migrations
├── generateDeck.js     # Orbitron API orchestration
├── streamParser.js     # Incremental JSON parser (SSE)
└── index.js            # (Note: Not present - see api/index.js)
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Express app | `app.js` | Route definitions, middleware stack |
| Authentication | `auth.js` | Passport OIDC, session management |
| Database | `db.js` | Pool, schema, CRUD operations |
| Deck generation | `generateDeck.js` | Orbitron API calls, prompt engineering |
| SSE streaming | `streamParser.js` | Real-time event parsing |
| Server entry | `api/index.js` | Vercel wrapper → imports `server/app.js` |

## CONVENTIONS

### Backend Patterns
- **Top-level await**: `app.js` uses `await migrate()` before routes
- **Error handling**: Custom `UnauthorizedError`, prefixed logs (`[auth]`, `[db]`)
- **Auth middleware**: Every protected route uses `isAuthenticated`
- **Session storage**: Postgres with 7-day TTL, `connect-pg-simple`
- **SSE format**: `event: <name>\ndata: <json>\n\n`

### Database Schema
- `users`: id, email, name, profile_image_url, timestamps
- `sessions`: sid, sess (JSONB), expire (indexed)
- `decks`: id, title, subtitle, slide_count, theme (JSONB), data (JSONB), timestamps, user_id (FK)

## ANTI-PATTERNS (SERVER)

- **NEVER save mid-stream decks** → wait for `streaming: false`
- **NEVER hardcode API endpoints** → Orbitron/Fireworks URLs configurable
- **DO NOT create sessions table** → Supabase Auth handles it
- **Avoid blocking on images** → parallel generation, shimmer placeholders

## KEY FUNCTIONS

| Function | File | Purpose |
|----------|------|---------|
| `generateDeck()` | `generateDeck.js` | Orbitron API orchestration |
| `streamParser()` | `streamParser.js` | SSE event parsing |
| `isAuthenticated()` | `auth.js` | Auth middleware |
| `generateId()` | `db.js` | Base64url deck ID |
| `migrate()` | `db.js` | Database migrations |

## EXTERNAL DEPENDENCIES

| Service | Endpoint | Purpose | Fallback |
|---------|----------|---------|----------|
| Orbitron | `orbitron--pastelsjuice8t.replit.app/api` | Claude/GPT-5 calls | None (app breaks) |
| Fireworks | `fireworks-endpoint--57crestcrepe.replit.app/api/v1/images` | Flux images | Images fail, slides complete |
| Replit Auth | `replit.com/oidc` | OIDC auth | Users can't sign in |
| Postgres | `DATABASE_URL` | Sessions + decks | In-memory (data loss) |

## PERFORMANCE NOTES

- **Streaming SSE**: Partial slides render immediately
- **Parallel images**: Non-blocking generation
- **Cached OIDC**: 1-hour TTL reduces discovery calls
- **Incremental parsing**: `streamParser.js` processes chunks

---

**Generated**: 2026-04-30
**Version**: 1.0
**Scope**: Server directory