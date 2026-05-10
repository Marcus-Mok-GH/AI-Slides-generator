# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-30
**Commit:** (unknown - not in git repo)
**Branch:** (unknown - not in git repo)

## OVERVIEW
AI Slides Generator - React 18 + Vite 5 frontend with Node 20 + Express 5 backend. Uses Replit OIDC auth, PostgreSQL for persistence, and integrates with Orbitron API (Claude Sonnet 4.6) and Fireworks Flux for image generation.

## STRUCTURE
```
.
├── api/                # Serverless-compatible API wrapper (Vercel entry)
├── server/             # Core Express backend (routes, auth, DB, AI integration)
├── src/               # Frontend (React + Vite)
│   ├── components/    # UI components (SlideViewer, SlideEditor, etc.)
│   ├── lib/           # Shared utilities (api.js, charts.js, useTheme.js)
│   ├── hooks/         # React hooks (useAuth.js)
│   └── App.jsx        # Root component (routing, auth, state machine)
├── vite.config.js      # Frontend build config (proxies /api → backend)
├── package.json        # Project metadata and scripts
└── AGENTS.md          # This file (project knowledge base)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Frontend entry | `src/App.jsx`, `src/main.jsx` | React root + bootstrap |
| Backend entry | `api/index.js` → `server/app.js` | Vercel wrapper → Express app |
| Slide generation | `server/generateDeck.js` | Orbitron API calls, prompt engineering |
| Real-time updates | `server/streamParser.js` | SSE event parsing |
| Authentication | `server/auth.js` | Replit OIDC, session management |
| Database | `server/db.js` | Postgres schema, CRUD operations |
| API client | `src/lib/api.js` | Fetch wrappers, SSE handlers |
| Styling | `src/index.css`, `src/*.css` | Standard CSS (no Tailwind) |
| Routing | `src/App.jsx` (lines 152-226) | URL routing, deck loading |
| Auto-save | `src/App.jsx` (lines 228-250) | Debounced deck persistence |

## CODE MAP

### Core Symbols (from analysis)

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `App` | Component | `src/App.jsx` | Root React component |
| `streamGenerateDeck` | Function | `src/lib/api.js` | SSE deck generation client |
| `generateDeck` | Function | `server/generateDeck.js` | Orbitron API orchestration |
| `streamParser` | Function | `server/streamParser.js` | Incremental JSON parser |
| `isAuthenticated` | Middleware | `server/auth.js` | Auth guard for protected routes |
| `generateId` | Function | `server/db.js` | Base64url deck ID generator |
| `HtmlSlide` | Component | `src/components/HtmlSlide.jsx` | Sandboxed slide renderer |
| `SlideViewer` | Component | `src/components/SlideViewer.jsx` | Deck editor UI |
| `SlideEditor` | Component | `src/components/SlideEditor.jsx` | Layout/editing panel |

### Key Exports by Module

- **`src/lib/api.js`**: `streamGenerateDeck()`, `saveDeckApi()`, `fetchCurrentUser()`, `UnauthorizedError`
- **`server/generateDeck.js`**: `generateDeck()`, `LAYOUTS`, `MODE_RULES`, `parseLength()`
- **`server/db.js`**: `getPool()`, `migrate()`, `saveDeck()`, `listDecks()`, `deleteDeck()`, `generateId()`
- **`server/auth.js`**: `isAuthenticated()`, `ensureAuthenticated()`, `getOidcConfig()`
- **`server/streamParser.js`**: `streamParser()` (SSE event parser)

## CONVENTIONS

### Project-Specific (deviations from standard)

- **Dual backend entry**: `api/index.js` (Vercel wrapper) imports and starts `server/app.js` (Express core). This enables both serverless deployment and local development.
- **Top-level await in server**: `server/app.js` uses `await migrate()` before route registration - valid in ESM but non-traditional for Express apps.
- **No Redux/Zustand**: Uses React `useState` + callbacks with explicit prop drilling. State flows down, callbacks up.
- **Debounced auto-save**: 700ms delay after last edit, skips if `deck.streaming === true`.
- **URL routing**: Supports both `/slide/{id}` (canonical) and `?deck={id}` (legacy).
- **Auth lifecycle**: Single `fetchCurrentUser()` on mount, global `slideai:unauthorized` event listener.
- **SSE streaming**: Custom `streamParser.js` for incremental JSON parsing (no off-the-shelf library).
- **Image generation**: Parallel Flux calls, base64 embedded in deck JSON, shimmer placeholders.
- **Slide charts**: Hand-rolled SVG in `lib/charts.js` (no Chart.js/Recharts dependency).

### Anti-Patterns (THIS PROJECT)

From code comments and architecture:

- **NEVER save a deck with `streaming: true`** → corrupts incomplete JSON
- **NEVER restate bullets in speaker notes** → always add depth/substance
- **NEVER hardcode hex values in CSS** → always reference theme CSS variables
- **NEVER truncate meaningful quotes** → preserve full context
- **NEVER repeat same layout 3x consecutively** → enforce diversity
- **DO NOT invent different hex values** → use canonical theme block
- **DO NOT add custom footer/page numbers** → auto-generated
- **Avoid "two-column" layout** → max once per deck
- **Avoid "content" layout** → max once per deck
- **Do NOT use paragraphs** → one idea per slide, bullets/steps only

## UNIQUE STYLES

- **Telegraphic documentation**: Short, imperative phrases. No fluff.
- **Absolute paths in docs**: All file references use `/home/runner/workspace/...` format.
- **Code blocks with line numbers**: References like `(line 152–226)` for precise navigation.
- **Anti-pattern callouts**: Explicit "NEVER"/"DO NOT" in comments and docs.
- **Gotcha sections**: "Non-Obvious Gotchas" with numbered warnings.
- **Important Files Map**: Table of critical files with one-line purpose.

## COMMANDS

```bash
# Install dependencies
npm install

# Start dev servers (frontend + backend in parallel)
npm run dev

# Build for production (Vite + React SWC)
npm run build

# Start production server
npm start

# Test deck generation (requires running server)
curl -X POST http://localhost:3001/api/generate-deck/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"AI trends","length":"5 cards"}'

# Inspect SSE stream
curl -X POST http://localhost:3001/api/generate-deck/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Test","length":"3"}' | jq .

# Database inspection (Postgres)
SELECT * FROM decks WHERE user_id = '<id>' ORDER BY updated_at DESC;
SELECT COUNT(*) FROM sessions WHERE expire > NOW();
```

## NOTES (Gotchas & Warnings)

1. **Streaming state**: NEVER save a deck with `streaming: true` → wait for `streaming: false`
2. **Regeneration context**: Single-slide regen sends full deck to backend for narrative consistency
3. **Image decoupling**: Image failures don’t block slide completion (shimmer → optional image)
4. **Partial events**: Outdated partials are ignored if full slide arrives first
5. **Replit Auth**: Sign-in redirects to `/api/login` (top-level nav), uses localStorage `returnTo`
6. **Session refresh**: Auto-refreshes expired access tokens once via refresh token
7. **Deck IDs**: Base64url (9 bytes crypto) → `encodeURIComponent()` for URLs
8. **Layout images**: "steps" and "comparison" excluded from auto-imagery (no space)
9. **Mode budgets**: "concise" vs "detailed" changes layouts, bullets, speaker notes
10. **HTML parser**: `decodeEntities()` is regex-based → handles well-formed HTML only
11. **Vite proxy**: `/api` → `localhost:3001` with `changeOrigin: true` (CORS-safe)
12. **External APIs**: Orbitron/Fireworks hardcoded → no fallback, coordinate with Conductor
13. **Charts**: Dependency-free SVG in `lib/charts.js` (bar/line/pie only)

## ARCHITECTURE DECISIONS

- **Dual entry (api + server)**: Supports Vercel serverless + local dev. Tradeoff: slight complexity for deployment flexibility.
- **No TypeScript**: JavaScript/JSX only. Simplifies build, but loses type safety.
- **No Redux**: Local state + callbacks. Easier to reason about, but prop drilling at scale.
- **SSE over WebSockets**: Simpler for unidirectional streaming, but no bidirectional comms.
- **Base64 images**: Embedded in JSON. Larger payloads, but simpler rendering.
- **Hand-rolled charts**: No dependency, but limited features.
- **Replit Auth**: Tight OIDC integration. Vendor lock-in risk.

## PERFORMANCE OPTIMIZATIONS

- Streaming SSE: Partial slides render immediately (better perceived speed)
- Parallel image generation: Non-blocking, shimmer → swap (no UI hang)
- Debounced auto-save: 700ms delay reduces DB writes
- Cached OIDC config: 1-hour TTL reduces OpenID discovery calls
- 7-day sessions: Postgres TTL with `connect-pg-simple` cleanup
- Incremental parsing: `streamParser.js` processes chunks (no full-buffer wait)

## KNOWN LIMITATIONS

- No real-time collaboration (single-user decks)
- No slide templates (always generated from scratch)
- No custom fonts (system fonts + CSS only)
- No batch operations (one deck at a time)
- No version history (auto-save overwrites)
- No offline export (PDF/PPTX not implemented)
- Mobile editing narrow (viewing optimized)

## EXTERNAL DEPENDENCIES

| Service | Endpoint | Purpose | Fallback |
|---------|----------|---------|----------|
| Orbitron | `orbitron--pastelsjuice8t.replit.app/api` | Claude/GPT-5 calls | **None** (app breaks) |
| Fireworks | `fireworks-endpoint--57crestcrepe.replit.app/api/v1/images` | Flux images | Images fail, slides complete |
| Replit Auth | `replit.com/oidc` | OIDC auth | Users can’t sign in |
| Postgres | `DATABASE_URL` | Sessions + decks | In-memory (data loss) |

---

**Generated**: 2026-04-30
**Version**: 2.0 (init-deep update)
**Scope**: Root project knowledge base