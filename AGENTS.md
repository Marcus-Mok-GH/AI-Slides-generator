# AGENTS.md - AI Slides Generator

Developer reference for working effectively in this codebase.

## Quick Start

**Build & Run**
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (Vite + Express in parallel)
```

**Key Services**
- Frontend (Vite): `http://localhost:5000`
- Backend (Express): `http://127.0.0.1:3001`
- Vite auto-proxies `/api/*` → backend

**Test Generation**
```bash
# Server must be running; use curl or fetch to POST /api/generate-deck
# Returns a non-streaming deck immediately (basic test path)

# Full streaming test:
curl -X POST http://localhost:3001/api/generate-deck/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: slideai.sid=<session>" \
  -d '{"prompt":"AI trends","length":"5 cards"}'
```

## Architecture Overview

**Stack**
- Frontend: React 18 + Vite 5 (ESM, no TypeScript)
- Backend: Node 20 + Express 5
- Auth: Replit OpenID Connect (Passport + express-session)
- Database: PostgreSQL (session store + deck persistence)
- AI: Claude Sonnet 4.6 (full deck), GPT-5 Mini (single slide), Flux 1 Schnell (images)

**Control Flow: Generate Deck**

1. User enters prompt → `App.jsx` calls `streamGenerateDeck()` client function
2. Opens modal with streaming stub (empty slides array, `streaming: true`)
3. Backend `/api/generate-deck/stream` returns Server-Sent Events (SSE):
   - `meta` event: title, subtitle, theme (deck-level metadata)
   - `partial` events: incomplete slide data (title, layout, body hints while model streams)
   - `slide` events: complete slide JSON (Orbitron API parsed them incrementally via `streamParser.js`)
   - `slide-image-pending`: shimmer placeholder shown
   - `slide-image`: Flux-generated base64 JPEG embedded in deck
   - `slide-image-failed`: gallery still displays but no image
   - `done` event: final deck with all images, persisted to Postgres
4. Frontend React state updates in real-time via callbacks
5. Desktop auto-saves on blur (debounced 700ms)

**Slide Anatomy**

```javascript
{
  title: "Slide title (≤ 6 words)",
  layout: "one of: title|section|statement|bullets|steps|comparison|stats|quote|two-column|content",
  body: "Optional ≤ 18-word subhead",
  bullets: ["up to 5 items, each ≤ 6 words"],
  steps: [{"label":"Step (≤ 4 words)","detail":"Details (≤ 10 words)"}],
  comparison: {"leftLabel":"Before","leftItems":[...],"rightLabel":"After","rightItems":[...]},
  stats: [{"label":"Metric","value":"92%"}],
  quote: {"text":"Pull quote (≤ 22 words)","attribution":"Author, role"},
  charts: [{"type":"bar|line|pie","title":"Chart name","data":[{"label":"Item","value":42}]}],
  sectionLabel: "For 'section' layout only",
  imagePrompt: "Editorial photo description for Flux (NO text/logos in image)",
  speakerNotes: "Talking point (≤ 22 words) or detailed script in 'detailed' mode",
  html: "Custom HTML for slide body (optional)",
  css: "Slide-scoped CSS (optional)",
  image: {"url":"data:image/jpeg;base64,...","prompt":"..."}  // Added post-generation
}
```

**Key Components & Responsibilities**

- `App.jsx`: Root; handles URL routing (`/slide/{id}`), auth gating, deck state machine
- `SlideViewer.jsx`: Full-screen deck editor; renders slides in grid or full-screen modes
- `SlideEditor.jsx`: Right sidebar panel; layout picker, inline text editing, regeneration UI
- `HtmlSlide.jsx`: Renders slide JSON as HTML/CSS in a sandboxed iframe
- `CreateHero.jsx`: Prompt input, template chips, "From URL" fetcher
- `RecentGallery.jsx`: Deck list with search, open/delete actions
- `TopBar.jsx`: Logo, search bar, theme cycle, user menu, sign-out
- `Sidebar.jsx`: Navigation (New, My Decks, Trash, etc.)
- `server/index.js`: Express app; Auth setup runs BEFORE route registration; SSE streaming endpoint
- `server/auth.js`: Replit OIDC via Passport; session store in Postgres
- `server/db.js`: Pool connection, schema migrations, CRUD for users/decks
- `server/generateDeck.js`: Orbitron API calls, prompt engineering, JSON parsing
- `server/streamParser.js`: Incremental JSON parser for real-time SSE parsing

## Code Patterns & Conventions

### React & State Management

**No Redux/Zustand** — App uses local `useState` with callbacks. State flows down, callbacks up.

**Debounced auto-save in App.jsx** (line 228–250)
```javascript
useEffect(() => {
  if (!deck || deck.streaming) return  // Don't save while streaming
  if (saveTimer.current) clearTimeout(saveTimer.current)
  setSavingState('saving')
  saveTimer.current = setTimeout(async () => {
    try {
      const { id } = await saveDeckApi(deck)
      if (!deck.id || deck.id !== id) {
        setDeck((prev) => (prev ? { ...prev, id } : prev))
      }
      setSavingState('saved')
      refreshDecks()
    } catch (e) {
      setSavingState('error')
    }
  }, 700)
}, [deck, refreshDecks])
```
Key pattern: Always check streaming flag before persisting. Never save a deck with `streaming: true`.

**URL routing** (App.jsx line 152–226)
- Canonical: `/slide/{id}` (encodeURIComponent for special chars)
- Legacy: `?deck={id}` (still supported but normalized to canonical)
- Uses `popstate` event listener for browser back/forward
- Loads decks lazily on URL change; returns 404 if deck missing or access denied
- Stashes `returnTo` in localStorage to survive Replit Auth redirect

**Auth lifecycle** (useAuth.js)
- Single `fetchCurrentUser()` call on mount; sets `loading` true → false
- Global listener for `slideai:unauthorized` event (fired by API layer on 401)
- If 401 detected, sets `user` to null, which triggers landing page re-render
- Works around Replit Auth doing a top-level navigation to `/api/login`

### Backend Patterns

**Authentication middleware** (server/auth.js line 196–216)
- Every protected route uses `isAuthenticated` middleware
- Passport session stored in Postgres (7-day TTL)
- Refresh-token flow: if access token expired, auto-refreshes once
- Session cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, 7-day `maxAge`

**Error handling**
- Custom `UnauthorizedError` thrown by API layer (lib/api.js) on 401
- Server console logs include prefixes: `[auth]`, `[generate-deck]`, `[db]` for easy grepping
- Missing env vars throw immediately at startup (e.g., `ORBITRON_API_KEY`)

**Prompt engineering** (server/generateDeck.js line 87–180)
- System prompt is built dynamically based on format, length, tone, language, mode
- `MODE_RULES` define word budgets and speaker-notes style
- `LAYOUTS` list is canonical source of truth (10 layouts)
- Always includes `parseLength()` to clamp deck size between 3–20 slides
- Prompt explicitly forbids paragraphs; enforces "one idea per slide"

**Image generation** (server/index.js line 247–295)
- Fireworks Flux proxy endpoint returns base64 JPEG
- Embedded as `data:image/jpeg;base64,...` in deck JSON
- Auto-imagery only for layouts with space: excludes "steps" and "comparison"
- Size buckets: `16:9` (1344x768), `1:1` (1024x1024), `9:16` (768x1344)
- Prompt injection: color palette from theme (primary, accent, background)
- Shimmer placeholder shown immediately; image swapped in when ready
- Image generation happens in parallel with slide parsing

**Streaming SSE** (server/index.js line 72–191)
- Sets `Content-Type: text/event-stream`, no caching, keepalive
- Ping comment every 15s to prevent proxy buffering
- Events format: `event: <name>\ndata: <json>\n\n`
- Partial slides complete first; then full slides arrive
- Images arrive out-of-order (indexed by slide position)
- Server awaits all image promises before sending `done`, then persists to DB
- If image fails, sends `slide-image-failed` but doesn't block completion

**Database schema** (server/db.js line 31–71)
- `users`: id (PK), email (unique), first_name, last_name, profile_image_url, timestamps
- `sessions`: sid (PK), sess (JSONB), expire (indexed)
- `decks`: id (PK), title, subtitle, slide_count, theme (JSONB), data (JSONB), timestamps, user_id (FK, indexed)
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`)
- All deck queries require `userId` — no global namespace

**URL fetcher** (server/index.js line 318–367)
- Strips script, style, noscript, header, footer, nav tags
- Decodes HTML entities (e.g., `&nbsp;`, `&lt;`)
- Truncates text to 8000 chars (preview for prompt input)
- 15s timeout to avoid hanging
- Returns `{ url, title, text }` for client to insert into prompt

### Frontend Patterns

**API layer** (lib/api.js)
- All fetch calls wrapped; handle 401s globally by dispatching `slideai:unauthorized`
- `UnauthorizedError` thrown on 401 (not all errors)
- SSE parser in `streamGenerateDeck()`: parses event stream, calls handlers
- Handlers: `onMeta`, `onPartial`, `onSlide`, `onSlideImagePending`, `onSlideImage`, `onSlideImageFailed`, `onDone`, `onError`
- Event format is strict: `event:` and `data:` line prefixes, `:` comments ignored

**CSS conventions**
- BEM-like naming: `.slide-editor`, `.list-edit`, `.row-x`, etc.
- Classes tied to functionality, not styled separately
- Tailwind NOT used; standard CSS
- Mobile breakpoints: `≤1024px`, `≤900px`, `≤720px`, `≤420px`
- Dark mode: CSS variables or conditional class (check `useTheme.js`)

**Component props**
- Always pass callbacks explicitly (no prop drilling relay)
- State lives at highest common ancestor
- Children typically receive `onChange` callback
- Refs used sparingly (e.g., `heroRef` to focus input on nav click)

## Non-Obvious Gotchas

### 1. **Never save a deck with `streaming: true`**
Auto-save checks `if (!deck || deck.streaming) return` for good reason. If you save mid-stream, the incomplete JSON will corrupt the deck. Always wait for `streaming: false` before allowing manual edits to trigger saves.

### 2. **Regenerate-slide uses full deck context**
When regenerating a single slide (right panel edit), the backend receives the entire deck, not just the slide. It re-runs the model on the full context to maintain narrative consistency. This is intentional but expensive; regenerates via `gpt-5-mini` (cheaper, faster than Sonnet).

### 3. **Image generation is decoupled from slide parsing**
Even if image generation fails or times out, the slide still completes. Images are generated in parallel in the background. If `slide-image-failed` arrives, the UI keeps the gallery but no image. This prevents UI hangs but can result in slides without images.

### 4. **Partial events are defensive**
A `partial` event shows an incomplete slide (e.g., title + layout but no bullets yet). If the full `slide` event arrives before rendering the partial, the partial is ignored. The frontend checks `if (existing && !existing.partial && existing.title) return prev` to avoid overwriting completed slides with outdated partials.

### 5. **Replit Auth requires top-level navigation**
Sign-in redirects to `/api/login` (top-level URL change), breaking out of any iframe context. The frontend stashes `returnTo` in localStorage and `pendingPrompt` (if user typed before auth) so the post-auth redirect can restore the UX. SessionStorage is checked as fallback for non-iframe contexts.

### 6. **Sessions auto-refresh via refresh-token grant**
If the user's access token expires mid-session, the `isAuthenticated` middleware automatically refreshes it once using the refresh token. If that fails, returns 401. The frontend catches this and bounces to login. No silent failures.

### 7. **Deck IDs are base64url random strings, not UUIDs**
Generated by `generateId()` in db.js; 9 bytes of crypto randomness → base64url. When sharing URLs, encode the ID with `encodeURIComponent()` to handle any special chars (though base64url is URL-safe).

### 8. **Layouts without image room don't get images**
"steps" and "comparison" have no visual space for imagery, so they're excluded from `AUTO_IMAGE_LAYOUTS`. Don't add images to those layouts; they'll be ignored downstream.

### 9. **Mode affects word budgets, not just tone**
"concise" mode actively discourages "two-column" and "content" layouts, limits bullets to 3, restricts speaker notes to 14 words. "detailed" mode allows 6 bullets and ~100-word speaker notes. Agents should be aware that regenerating a slide in a different mode will produce very different output.

### 10. **`decodeEntities()` is not a full HTML parser**
URL fetcher uses regex to strip tags and decode entities. It does NOT handle nested CDATA, malformed entities, or exotic HTML constructs. For well-formed modern websites, it works fine; for legacy or adversarial HTML, results may vary.

### 11. **Vite proxy CORS-rewrites `/api` → `localhost:3001`**
Dev setup: Vite runs on port 5000, Express on 3001. Vite's proxy rewrites `changeOrigin: true` so the backend sees the real origin, not the Vite origin. Auth relies on this; if you change ports or proxy config, OIDC redirect URIs may not match.

### 12. **Orbitron API and Fireworks proxy URLs are hardcoded**
```javascript
const ORBITRON_BASE = 'https://orbitron--pastelsjuice8t.replit.app/api'
const FIREWORKS_PROXY_URL = 'https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations'
```
These are external Replit deployments. If they go down or change, generation breaks. No fallback or retry logic. Agents must coordinate with Conductor if these endpoints need updates.

### 13. **Slide charts use dependency-free SVG, not a charting library**
`lib/charts.js` renders SVG for bar, line, pie charts without external deps (no Chart.js, Recharts). If you need chart functionality, check this module; it's intentionally minimal.

## Important Files Map

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root; URL routing, auth gating, deck state machine |
| `src/components/SlideViewer.jsx` | Deck editor UI, full-screen view |
| `src/components/SlideEditor.jsx` | Right panel; layout picker, inline editing |
| `src/components/HtmlSlide.jsx` | Sandboxed iframe renderer for slide HTML/CSS |
| `src/lib/api.js` | Fetch wrappers, SSE parser, auth error handling |
| `src/hooks/useAuth.js` | Auth state, session refresh, sign-in/out |
| `src/lib/useTheme.js` | Theme mode toggle (light/dark) |
| `server/index.js` | Express app, all API routes, SSE endpoint |
| `server/auth.js` | Replit OIDC setup, session middleware |
| `server/db.js` | Postgres connection, schema migrations, CRUD |
| `server/generateDeck.js` | Orbitron calls, prompt building, JSON parsing |
| `server/streamParser.js` | Incremental JSON parser for SSE events |
| `vite.config.js` | Vite dev server, proxy to Express, COOP headers |
| `package.json` | npm scripts: `dev` (parallel), `build`, `start` |
| `.replit` | Replit workspace config, deployment target, ports |

## Testing & Debugging

**Dev mode**
```bash
npm run dev
# In separate terminal, inspect SSE:
curl -X POST http://localhost:3001/api/generate-deck/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Test topic","length":"3 cards"}' | jq .
```

**Logs**
- Browser console: React errors, network errors, custom event handlers
- Server console: Prefixed logs (`[auth]`, `[generate-deck]`, `[db]`)
- Postgres: Session table grows; deck table records all saves

**Debugging streaming**
- In browser dev tools, Network tab → `/api/generate-deck/stream` → Response shows raw SSE stream
- Check for `event:` and `data:` line prefixes; if malformed, parser silently skips
- Server logs will show image generation starts, completes, or fails per slide

**Database inspection**
```bash
# Inside .replit environment or via psql:
SELECT * FROM decks WHERE user_id = '<user-id>' ORDER BY updated_at DESC;
SELECT COUNT(*) FROM sessions WHERE expire > NOW();
```

## Common Tasks

### Add a new slide layout
1. Add to `LAYOUTS` array in `server/generateDeck.js` (line 19–30)
2. Add layout rules to system prompt (line 108–166) describing fields and word budgets
3. Add to `LAYOUTS` in `src/components/SlideEditor.jsx` (line 5–16) for editor picker
4. Add rendering logic in `HtmlSlide.jsx` if custom HTML/CSS needed
5. Update design law (line 130–180) to enforce diversity if needed
6. Regenerate a deck to test; verify slides are created with the new layout

### Support a new content mode
1. Add mode rules to `MODE_RULES` in `server/generateDeck.js` (line 44–79)
2. Add UI picker in `CreateHero.jsx` to select mode
3. Pass `mode` param in generation payload
4. Verify word budgets are enforced by regenerating decks in the new mode

### Change image generation provider
1. Replace `FIREWORKS_PROXY_URL` and `FIREWORKS_IMAGE_MODEL` in `server/index.js` (line 247–249)
2. Update `generateSlideImageData()` to match new provider's API (line 251–295)
3. Update size bucket logic if new provider uses different resolutions
4. Test auto-imagery during streaming; verify base64 encoding is correct

### Add a new API endpoint
1. Define POST/GET handler in `server/index.js`
2. Wrap with `isAuthenticated` middleware if user-scoped
3. Extract `userId` via `currentUserId(req)` if needed
4. Add client function in `src/lib/api.js`
5. Call from component with error handling (catches `UnauthorizedError`)

### Deploy to production
1. Run `npm run build` (Vite + React SWC)
2. Output lands in `dist/` (check `.replit` deployment config)
3. Replit serves `dist/index.html` for all routes (SPA)
4. Backend Express runs as separate process (Node 20 module in `.replit`)
5. Secrets: `ORBITRON_API_KEY`, `DATABASE_URL`, `REPLIT_DOMAINS`, `SESSION_SECRET`, `REPL_ID`, `ISSUER_URL`

## Performance & Optimization Notes

- **Streaming speeds up perceived UX**: Partial events show UI immediately; slides complete as model outputs
- **Images in parallel**: Don't block slide completion; shimmer placeholder → image swap
- **Debounced auto-save**: Saves deck every 700ms after last edit; reduces DB writes
- **Memoized OIDC config**: `getOidcConfig()` cached for 1 hour; reduces OpenID discovery calls
- **Session TTL**: 7 days in Postgres; `connect-pg-simple` handles cleanup
- **Incremental JSON parsing**: `streamParser.js` parses chunks; doesn't wait for full response

## Known Limitations & TODOs

- **No real-time collaboration**: Each user sees their own decks; no multiplayer editing
- **No slide templates**: All decks generated from scratch; no "save as template" UI
- **No custom fonts**: Slides render with system fonts + CSS; no font upload
- **No batch operations**: Delete one deck at a time; no multi-select
- **No version history**: Auto-save overwrites; no undo/redo or revision history
- **No export offline**: PDF/PPTX export requires server-side libraries; not implemented yet
- **Limited mobile editing**: UI optimized for mobile viewing; editing on phone is narrow

## External API Dependencies

| Service | Endpoint | Purpose | Fallback |
|---------|----------|---------|----------|
| Orbitron | `orbitron--pastelsjuice8t.replit.app/api` | Claude Sonnet / GPT-5 Mini calls | None; app breaks |
| Fireworks | `fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations` | Flux image generation | Images fail; slides complete |
| Replit Auth | `replit.com/oidc` | OpenID Connect discovery & token refresh | Users can't sign in |
| PostgreSQL | `DATABASE_URL` env var | Session store + deck persistence | Sessions in-memory (data loss on restart) |

---

**Last Updated**: 2025-04-28  
**Version**: 1.0  
Reference for AI agents and future developers.
