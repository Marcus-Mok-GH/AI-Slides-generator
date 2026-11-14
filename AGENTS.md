# PROJECT KNOWLEDGE BASE

**Updated:** 2026-11-03
**Repo:** `Marcus-Mok-GH/AI-Slides-generator`, branch `main`

## OVERVIEW
AI Slides Generator - React 18 + Vite 5 frontend with Node 20 + Express 5 backend. Uses email/password auth (bcryptjs + JWT), PostgreSQL for persistence, and integrates with Pollinations AI (openai/gpt-6-luna) for deck generation via server/llm.js.

## STRUCTURE
```
.
├── api/                # Vercel functions: built index.js + health.mjs, diag.mjs
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
| Backend entry | `api/index.js` (built) ← `serverless/entry.js` → `server/app.js` | Vercel function bundle ← entrypoint → Express app |
| Slide generation | `server/generateDeck.js` | Pollinations calls (via `server/llm.js`), prompt engineering |
| Real-time updates | `server/streamParser.js` | SSE event parsing |
| Authentication | `server/middleware/auth.js`, `server/routes/auth.js` | Email/password, bcryptjs + JWT stored in localStorage |
| Database | `server/db.js` | Postgres schema, CRUD operations |
| API client | `src/lib/api.js` | Fetch wrappers, SSE handlers |
| Styling | `src/index.css`, `src/*.css` | Standard CSS (no Tailwind) |
| Routing | `src/App.jsx` (lines 54–63, 214–227) | `deckIdFromLocation()`, `PAGE_PATHS`, `pageFromLocation()` |
| Auto-save | `src/App.jsx` (lines 229–251) | Debounced deck persistence |

## CODE MAP

### Core Symbols (from analysis)

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `App` | Component | `src/App.jsx` | Root React component |
| `streamGenerateDeck` | Function | `src/lib/api.js` | SSE deck generation client |
| `generateDeck` | Function | `server/generateDeck.js` | LLM orchestration (Pollinations) |
| `streamParser` | Function | `server/streamParser.js` | Incremental JSON parser |
| `authMiddleware` | Middleware | `server/middleware/auth.js` | JWT guard for protected routes |
| `generateId` | Function | `server/db.js` | Base64url deck ID generator |
| `HtmlSlide` | Component | `src/components/HtmlSlide.jsx` | Sandboxed slide renderer |
| `SlideViewer` | Component | `src/components/SlideViewer.jsx` | Deck editor UI |
| `SlideEditor` | Component | `src/components/SlideEditor.jsx` | Layout/editing panel |

### Key Exports by Module

- **`src/lib/api.js`**: `streamGenerateDeck()`, `saveDeckApi()`, `fetchCurrentUser()`, `UnauthorizedError`
- **`server/generateDeck.js`**: `generateDeck()`, `LAYOUTS`, `MODE_RULES`, `parseLength()`
- **`server/db.js`**: `getPool()`, `migrate()`, `saveDeck()`, `listDecks()`, `deleteDeck()`, `generateId()`
- **`server/middleware/auth.js`**: `signToken()`, `verifyToken()`, `hashPassword()`, `comparePassword()`, `authMiddleware()`, `optionalAuthMiddleware()`
- **`server/routes/auth.js`**: default-exported Express router (register / login / me)
- **`server/llm.js`**: `llmUrl()`, `llmHeaders()`, `llmError()`, `DECK_MODEL` / `SLIDE_MODEL` / `AGENT_MODEL` (all default `openai/gpt-6-luna`)
- **`server/streamParser.js`**: `streamParser()` (SSE event parser)

## CONVENTIONS

### Project-Specific (deviations from standard)

- **Single backend source + build step**: all Express code lives in `server/`. `serverless/entry.js` imports it for local dev, and `npm run api:build` bundles that entrypoint into the committed `api/index.js` (CommonJS) for Vercel. Re-run the build after touching `server/`.
- **Lazy schema setup**: `server/app.js` never awaits `migrate()` at module scope. `ensureSchema()` runs on the first request, so a slow or broken database degrades DB routes instead of killing the function at import time. Do not reintroduce top-level await.
- **No Redux/Zustand**: Uses React `useState` + callbacks with explicit prop drilling. State flows down, callbacks up.
- **Debounced auto-save**: 700ms delay after last edit, skips if `deck.streaming === true`.
- **URL routing**: Decks at `/app/slide/{id}` (canonical, session required), legacy `?deck={id}`, full-page views at `/app/decks` and `/app/templates` (`PAGE_PATHS` / `pageFromLocation()` in `src/App.jsx`).
- **Public share links**: `/share/{id}` renders `SharedDeckPage` from `main.jsx` before the auth guard, and `AuthGuard` shows the same read-only page for a signed-out visitor on a legacy `/app/slide/{id}` link. It reads `GET /api/shared/decks/:id` (registered before `app.use('/api', authMiddleware)` in `server/app.js`, resolved by `getDeckById()` in `server/db.js`). Deck ids are random 72-bit tokens, so the link is the permission. The same page downloads PDF/PPTX by calling `src/lib/exportDeck.js` in the visitor's own browser — no auth and no `/api/export` round trip, and the file matches the stage because it is the same slide document.
- **"Start from this deck" handoff**: the shared page's CTA links to `/app?remix={deckId}`; `LoginPage` then opens on sign-up with remix copy, and once `AuthGuard` mounts `<App />` the mount effect in `src/App.jsx` strips the param, `POST`s `/api/shared/decks/:id/copy` (auth required, fresh deck id, no credits spent) and opens the copy in the viewer. OTP verify/reset keep `window.location.search` so the intent survives a full reload.
- **Auth lifecycle**: Single `fetchCurrentUser()` on mount, global `slideai:unauthorized` event listener.
- **SSE streaming**: Custom `streamParser.js` for incremental JSON parsing (no off-the-shelf library).
- **Image generation**: deck generation no longer produces images. Only
  Agent Five's image tool calls a legacy Fireworks proxy
  (`server/agentFive.js`); that proxy is offline, so the tool fails on its own
  without affecting deck generation.
- **Design tokens**: light and dark palettes both live in `src/index.css`
  (`:root` and `[data-theme="dark"]`). Component CSS must reference tokens, not
  raw hex. Headings use `var(--font-display)`; `var(--font-mono)` is reserved
  for the ⌘K hint.
- **Viewer rail**: rail + mobile strip share one `RailItem` in `SlideViewer.jsx`
  rendering live 16:9 iframe thumbnails (`ThumbPreview.jsx`). Thumbs mount lazily
  (IntersectionObserver) and scale the 1280×720 canvas to the box width
  (ResizeObserver). Editing a slide repaints its thumb live.
- **Viewer layout**: `SlideViewer.css` puts the desktop grid in its base rules
- **Viewer layout**: `SlideViewer.css` puts the desktop grid in its base rules
  and keeps the trailing media queries for mobile/touch overrides only.
- **Viewer rail**: desktop rail items are live 16:9 thumbnails (`ThumbPreview.jsx`,
  lazily-mounted scaled iframes shared with the mobile strip via `RailItem`),
  with a number chip overlay and one-line title. The slide position lives in a
  `stage-footer` bar (progress line left, `n / total` right) under the stage —
  there is no floating counter pill any more.
- **Mobile viewer**: under 900px the stage area hugs the slide's 16:9 box
- **Mobile viewer**: under 900px the stage area hugs the slide's 16:9 box
  (`aspect-ratio`, no desktop gutters) and the prev/next arrows plus counter
  sit *below* that box (`bottom: -58px`) instead of on top of the slide.
  Landscape switches to `height: 100%` with side gutters because height, not
  width, is the binding constraint. `.viewer` uses `100dvh` so browser chrome
  never pushes the controls below the fold. The stage supports swipe nav.
- **Mobile editing**: the editor is a bottom sheet, not a full-height drawer.
  Its height lives in `--editor-sheet-h` (`SlideViewer.css`, used by
  `SlideEditor.css`); the stage reserves the same height via
  `padding-bottom` so the slide stays visible *and live* above the sheet while
  you type. Landscape docks the sheet to the right instead (`padding-right`).
- **Viewer layout**: desktop grid in base rules, mobile/touch overrides in
  trailing media queries only.
- **Stage footer**: slide position + progress live in `.stage-footer` under the
  slide (the old floating counter pill is gone).
- **Touch + notch**: `index.html` sets `viewport-fit=cover`; anything pinned to
  an edge (mobile nav, present HUD, editor sheet, viewer bar) must pad with
  `env(safe-area-inset-*)`.
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
- **Repo-relative paths in docs**: file references are relative to the repo root.
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

# Run the test suite
npm test

# Build for production (Vite + esbuild API bundle)
npm run build

# Rebuild the Vercel function bundle only
npm run api:build

# Create schema in a fresh database
npm run db:init

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
SELECT id, email, created_at FROM users ORDER BY created_at DESC;
```

## NOTES (Gotchas & Warnings)

1. **Streaming state**: NEVER save a deck with `streaming: true` → wait for `streaming: false`
2. **Regeneration context**: Single-slide regen sends full deck to backend for narrative consistency
3. **Image decoupling**: Image failures don’t block slide completion (shimmer → optional image)
4. **Partial events**: Outdated partials are ignored if full slide arrives first
5. **Auth token**: JWT in `localStorage` under `slideai:token`; `src/lib/api.js` attaches it to every request and clears it on a 401
6. **Schema bootstrap**: migrations run lazily on first request — the first request after a cold start may be slower
7. **Deck IDs**: Base64url (9 bytes crypto) → `encodeURIComponent()` for URLs
8. **Layout images**: "steps" and "comparison" excluded from auto-imagery (no space)
9. **Mode budgets**: "concise" vs "detailed" changes layouts, bullets, speaker notes
10. **HTML parser**: `decodeEntities()` is regex-based → handles well-formed HTML only
11. **Vite proxy**: `/api` → `localhost:3001` with `changeOrigin: true` (CORS-safe)
12. **External APIs**: Pollinations key comes from `POLLINATIONS_API_KEY`; base URL and models are overridable, but there is no fallback provider
13. **Charts**: Dependency-free SVG in `lib/charts.js` (bar/line/pie only)
14. **Google sign-in**: `GOOGLE_CLIENT_ID` (server env) enables it; `/api/config` exposes the ID to the login page, which hides the Google button when unset. ID tokens are verified against Google's tokeninfo endpoint in `server/routes/auth.js` (`/api/auth/google`); accounts link by verified email and have `password_hash = NULL` (no password login)

## ARCHITECTURE DECISIONS

- **Single backend source + build step**: all Express code lives in `server/`; `serverless/entry.js` serves local dev and `npm run api:build` bundles it into `api/index.js` (CommonJS) for Vercel. Tradeoff: a build step to remember after backend edits.
- **No TypeScript**: JavaScript/JSX only. Simplifies build, but loses type safety.
- **No Redux**: Local state + callbacks. Easier to reason about, but prop drilling at scale.
- **SSE over WebSockets**: Simpler for unidirectional streaming, but no bidirectional comms.
- **Base64 images**: Embedded in JSON. Larger payloads, but simpler rendering.
- **Hand-rolled charts**: No dependency, but limited features.
- **Self-hosted auth**: bcryptjs + JWT. No vendor lock-in, but no SSO / OAuth providers.

## PERFORMANCE OPTIMIZATIONS

- Streaming SSE: Partial slides render immediately (better perceived speed)
- Parallel image generation: Non-blocking, shimmer → swap (no UI hang)
- Debounced auto-save: 700ms delay reduces DB writes
- Stateless JWT auth: no session lookup or session table on the request path
- Incremental parsing: `streamParser.js` processes chunks (no full-buffer wait)

## KNOWN LIMITATIONS

- No real-time collaboration (single-user decks)
- Templates are preset prompts, not true slide templates (decks are still generated from scratch)
- No custom fonts (system fonts + CSS only)
- No batch operations (one deck at a time)
- No version history (auto-save overwrites)
- PDF/PPTX export prefers server-side headless Chrome (Puppeteer). Without a browser binary the server returns `X-Export-Mode: text` and the viewer rasterizes the same slide document in the browser instead, so a host without Chrome still produces a deck-accurate file
- Mobile editing is a bottom sheet that stops part-way up the screen; the live
  slide preview above it is small on short phones (~300px wide) and the edit
  prompt box is correspondingly short
- No live image provider: Agent Five's image tool points at an offline proxy
- No error boundary: a render-time throw blanks the app instead of showing a fallback

## EXTERNAL DEPENDENCIES

| Service | Endpoint | Purpose | Fallback |
|---------|----------|---------|----------|
| Pollinations | `gen.pollinations.ai/v1` (`POLLINATIONS_API_KEY`) | GPT-6 Luna deck/agent calls | **None** (generation breaks) |
| Fireworks (legacy proxy) | `fireworks-endpoint--57crestcrepe.replit.app` (offline) | Agent Five image + web-search tools only | Agent tools fail; deck generation unaffected |
| Postgres | `POSTGRES_URL` (Neon only, no fallbacks) | Users + decks | No-op mock pool (DB routes 503, data loss) |

---

**Generated**: 2026-04-30
**Version**: 2.0 (init-deep update)
**Scope**: Root project knowledge base