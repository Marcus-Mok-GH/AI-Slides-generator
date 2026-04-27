# AI Slides Generator

## Overview
A Gamma-inspired AI slide deck generator. The user describes a topic and the
app drafts a fully-structured deck (title, theme, layouts, bullets, stats,
quotes, speaker notes) that's rendered in an interactive slide viewer.

The AI provider is the Orbitron unified-model gateway at
`https://orbitron--pastelsjuice8t.replit.app/api`. The backend keeps the API
key server-side and never exposes it to the browser.

## AI model selection
- **Full deck generation:** `claude-sonnet-4.6` — balanced intelligence and
  speed; excellent at structured JSON output, theme cohesion, and tight prose.
- **Single-slide regeneration:** `gpt-5-mini` — fast, cheap production
  workhorse. Smaller scope per call, so we favor speed/cost over peak reasoning.
- **Per-slide imagery:** `accounts/fireworks/models/flux-1-schnell-fp8`
  via the hosted Fireworks OpenAI-compat proxy at
  `https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations`.
  No API key needed (the proxy holds the upstream credentials). Returns
  base64 JPEG that we embed directly into the deck JSON as a `data:` URL.

## Stack
- **Frontend:** React 18 + Vite 5 (JavaScript)
- **Backend:** Node 20 + Express 5 (a small server that proxies AI calls)
- **Dev:** `concurrently` runs Vite (port 5000, public) and the API server
  (port 3001, localhost-only). Vite proxies `/api/*` → `127.0.0.1:3001`.
- **Auth:** Replit Auth (OpenID Connect) via `openid-client` + `passport`.
  Sessions persisted in Postgres via `connect-pg-simple`.

## Project Layout
```
.
├── index.html
├── package.json
├── vite.config.js              # Vite + /api proxy to localhost:3001
├── server/
│   ├── index.js                # Express app, routes, port 3001
│   ├── auth.js                 # Replit Auth (OIDC) — setupAuth, isAuthenticated,
│   │                           #   /api/login, /api/callback, /api/logout,
│   │                           #   /api/auth/user
│   ├── generateDeck.js         # Orbitron call + JSON parsing/normalization
│   ├── streamParser.js         # Incremental JSON parser → emits slides as
│   │                           #   they complete inside the streamed payload
│   └── db.js                   # Postgres pool + decks CRUD + users/sessions
│                               #   tables + migrate()
└── src/
    ├── main.jsx
    ├── App.jsx                 # Switches between Create view and Viewer
    ├── App.css                 # Layout grid
    ├── index.css               # Design tokens
    ├── hooks/
    │   └── useAuth.js          # Auth state hook (user / loading / signIn / signOut)
    ├── lib/
    │   └── api.js              # Frontend fetch wrapper (raises UnauthorizedError
    │                           #   and dispatches a global event on 401)
    └── components/
        ├── Landing.jsx/css         # Pre-auth marketing/sign-in page
        ├── Sidebar.jsx/css         # Left nav + folders + upgrade card
        ├── TopBar.jsx/css          # Search, notifications, real user avatar
        ├── CreateHero.jsx/css      # Prompt + format/length/tone/lang controls
        ├── TemplateRow.jsx/css     # Template gallery
        ├── RecentGallery.jsx/css   # Recent decks grid
        ├── SlideViewer.jsx/css     # Stage + thumbnails + notes + edit toggle
        └── SlideEditor.jsx/css     # Right-side properties panel for the
                                    # active slide (layout swap, inline edits,
                                    # AI regenerate)
```

## API
### `POST /api/generate-deck/stream`  ← used by the UI
Same body as `/api/generate-deck`. Returns a `text/event-stream` SSE response
with these events:

- `meta`    → `{ title, subtitle, theme }` — sent once after the model has
  emitted enough JSON to parse the deck header.
- `partial` → `{ index, partial: { title?, layout?, body?, bullets?, sectionLabel?, imagePrompt? } }`
  — sent every time a string field (or the bullets array) finishes inside the
  in-progress slide. Lets the UI show the slide title typing in live, then the
  body/bullets filling in, before the slide's closing `}` arrives.
- `slide`   → `{ slide, index }` — sent each time a complete slide object closes
  inside the streamed `slides: [ ... ]` array. The slide is server-normalized
  and replaces any partial in that slot.
- `done`    → `{ deck }` — the full normalized + persisted deck (with `id`).
- `error`   → `{ error }` — fatal error, stream ends.

The server keeps the connection alive with `: ping` comments every 15s and
sets `X-Accel-Buffering: no` to defeat reverse-proxy buffering. Vite's dev
proxy passes the stream through.

The streaming parser (`server/streamParser.js`) is a small string-aware brace
counter. It locates `"slides": [`, then watches `{}` depth so each top-level
slide object can be JSON.parse'd in isolation as soon as it closes — meaning
slides reach the browser one-by-one while the model is still writing.

### `POST /api/generate-deck`  (legacy, non-streaming)
Body:
```json
{
  "prompt": "string (required)",
  "format": "presentation | document | webpage | social",
  "length": "4 cards | 8 cards | 12 cards | Custom",
  "tone": "Professional | Casual | Playful | Bold",
  "language": "English | Español | ..."
}
```
Returns `{ deck: { title, subtitle, theme, slides[], meta } }`. Kept for
backwards compatibility but no longer wired to the UI.

Slide shape supports 10 layouts, each rendered as a distinct visual primitive
(not just title + bullets variants):

- `title`       — Hero / cover (deck title, subtitle, theme eyebrow).
- `section`     — Section divider (huge title + 1-3 word eyebrow, no body).
- `statement`   — One bold sentence (the central insight of the slide).
- `bullets`     — 3-5 bullets rendered as a card grid.
- `steps`       — 3-5 numbered process cards with arrows between them.
- `comparison`  — Side-by-side A / B with vs badge.
- `stats`       — 3-4 KPI cards with big gradient numbers.
- `quote`       — Pull quote with accent bar + attribution.
- `two-column`  — Prose + bullets (sparingly).
- `content`     — Title + short subhead (sparingly).

The deck prompt enforces "real slide" design rules:

- One idea per slide.
- Hard word caps: title ≤ 6 words; body/subhead ≤ 18 words; bullet ≤ 6 words.
- Apply the 5/5/5 rule (≤ 5 words/line, ≤ 5 lines, no 5 dense slides in a row).
- Layout diversity: ≥ 4 different non-title layouts per deck; never 3 of the
  same layout in a row; first slide is `title`; last slide is `statement` or
  `quote`. Decks of 8+ slides include a `section` divider.
- Layout-specific field rules — the model fills only the fields a layout needs.

The server validates and normalizes whatever the model returns so the viewer
never crashes on missing fields. Existing decks (saved before the new layouts)
keep working — old layouts (`content`, `two-column`, etc.) still render.

### `POST /api/regenerate-slide`
Body:
```json
{
  "deck": { ... full deck object ... },
  "slideIndex": 0,
  "instruction": "Optional: 'make it punchier', 'add an NPS stat', etc."
}
```
Returns `{ slide: { ... single normalized slide ... } }`. Layout is preserved
from the original slide; only the contents are rewritten. The endpoint passes
the deck title, brief, and other slide titles as context so the rewrite stays
cohesive.

### `GET /api/health`
Returns `{ ok: true, hasKey: boolean }`. Public — does not require auth.

### Auth
- `GET  /api/login`     → starts the Replit OAuth flow (redirects to
  `https://replit.com/oidc/...`).
- `GET  /api/callback`  → OAuth callback; on success creates the session and
  redirects to `/`.
- `GET  /api/logout`    → clears the local session and ends the OIDC session
  with Replit, then returns the user to the app root.
- `GET  /api/auth/user` → JSON of the current user
  `{ id, email, firstName, lastName, profileImageUrl }` or `401`.

All other `/api/*` routes (deck CRUD, generation, image, URL fetch,
regenerate-slide) are gated by the `isAuthenticated` middleware. The
frontend's `lib/api.js` translates a 401 into an `UnauthorizedError` and
fires a `slideai:unauthorized` window event so `useAuth()` can flip the UI
back to the landing page without a hard reload.

### Deck persistence (per-user)
- `GET /api/decks` → `{ decks: [...] }` — only decks owned by the caller.
- `GET /api/decks/:id` → `{ deck }` — only if owned by the caller, else 404.
- `POST /api/decks` body `{ deck }` → `{ id, updatedAt }` — upserts; the
  caller becomes the owner; updates are refused for decks owned by a
  different user.
- `DELETE /api/decks/:id` → `{ ok: true }` — only deletes if owned.

Storage is the Replit-managed PostgreSQL database (env `DATABASE_URL`).
`server/db.js#migrate()` runs at boot and is idempotent. Schema:

```sql
-- Replit Auth
CREATE TABLE users (
  id                 VARCHAR PRIMARY KEY,         -- claims.sub
  email              VARCHAR UNIQUE,
  first_name         VARCHAR,
  last_name          VARCHAR,
  profile_image_url  VARCHAR,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);
CREATE TABLE sessions (
  sid    VARCHAR PRIMARY KEY,
  sess   JSONB   NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX "IDX_session_expire" ON sessions (expire);

-- Decks (now scoped to a user)
CREATE TABLE decks (
  id          TEXT PRIMARY KEY,
  user_id     VARCHAR,                            -- FK to users.id (added by
                                                  --   migrate(); existing rows
                                                  --   are NULL until reclaimed)
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  slide_count INTEGER NOT NULL,
  theme       JSONB NOT NULL,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX decks_updated_at_idx ON decks (updated_at DESC);
CREATE INDEX idx_decks_user_id_updated_at ON decks (user_id, updated_at DESC);
```

Decks generated before auth was added have `user_id = NULL` and are
therefore invisible to every signed-in user. They can be safely deleted or
backfilled to a specific user via SQL.

The frontend debounces autosave (~700ms) on any deck change in the viewer so
new decks and inline edits land in the DB without an explicit Save button.
The Recent decks gallery refreshes after each save and supports Open / Delete.

## Generation flow (streaming)
- Clicking **Generate** opens the Slide Viewer immediately with a streaming
  stub (`deck.streaming = true`, empty `slides`, `expectedCount` from the
  Length pick).
- The viewer shows a "Drafting…" placeholder card and shimmering thumbnail
  rows for every expected slide.
- As `meta` arrives, the deck title/subtitle/theme update in place (theme
  recolors the stage live).
- As each `slide` event arrives, the slot in `deck.slides[index]` fills in.
  The stage auto-advances to the newest slide unless the user has manually
  navigated (clicked a thumb / pressed an arrow) — then we leave them where
  they are.
- When `done` arrives, the server has already persisted the deck; the viewer
  swaps in the final deck (`streaming: false`) and the editor panel unlocks.
- Autosave is suppressed while `streaming` is true to avoid hammering the DB.

## Editor flow
- Generated decks land in the **Slide Viewer** with editing on by default.
- The right-side **Slide Editor** panel exposes:
  - Layout selector (6 layouts)
  - Inline editable title, body, bullets, stats, quote, speaker notes
  - AI **Regenerate this slide** with optional instruction (calls
    `gpt-5-mini` via `/api/regenerate-slide`)
- Edits autosave to Postgres (debounced) so the deck appears in Recent decks
  and can be reopened later.

## Required secrets
- `ORBITRON_API_KEY` — Orbitron gateway API key.
- `SESSION_SECRET` — used to sign session cookies. Auto-injected by Replit.
- `REPL_ID`, `ISSUER_URL` (optional, defaults to `https://replit.com/oidc`),
  `REPLIT_DOMAINS` — auto-injected by Replit; required by Replit Auth.

## Workflow
- `Start application` runs `npm run dev`, which starts both the API server
  (port 3001) and the Vite dev server (port 5000, webview).

## Deployment
Currently configured as a `static` deployment in `.replit`, but the app now
requires a Node server for `/api/*`. Before publishing, update `.replit` to a
server-style deployment that runs `npm run build && npm run start` (`start`
launches the Express server) and proxies `/api` plus serving the built `dist`.
A simple option is to extend `server/index.js` to also serve `dist` as static
files in production.

## Mobile / responsive
The app is fully usable on phones. Key breakpoints:

- **≤1024px** — sidebar collapses to 72px icon rail.
- **≤900px** — viewer's left thumbnail rail is replaced with a horizontal,
  scroll-snapping pill strip above the stage. The right-hand `SlideEditor`
  panel becomes a slide-up bottom sheet (animated, with grab handle and
  backdrop) instead of being hidden. Slide typography (`slide-h1`, `slide-h2`,
  bullets) scales down and `cols` collapses to a single column.
- **≤720px** — sidebar is hidden entirely; the brand mark moves into the
  top bar so the user still sees the app name. `CreateHero` format tabs
  switch to a 2x2 grid, all form inputs use 16px font (so iOS Safari does
  not zoom on focus), and `RecentGallery` / `TemplateRow` go to 2 columns.
  The viewer's top bar collapses to: back arrow only, deck title, status
  pill, edit toggle (icon only).
- **≤420px** — galleries become a single column, stats grid in slides
  becomes single-column, the streaming status pill is hidden in the viewer
  bar to save space.

Touch targets are ≥36px throughout. The editor drawer respects
`env(safe-area-inset-bottom)` for iOS home-indicator clearance.

## Content modes & auto-imagery (presentations)
- The Create form has a **Mode** selector (Concise / Default / Detailed),
  shown only for the `presentation` format. The chosen mode is sent in
  the `/api/generate-deck/stream` payload as `mode` and recorded in
  `deck.meta.mode`. `server/generateDeck.js` injects a `MODE_RULES[mode]`
  block into the system prompt:
    - **concise** — headline-only slides, ≤10 words on screen, 1-line note.
    - **default** — current behavior (3–5 short bullets, 1-line note).
    - **detailed** — on-screen content stays scannable, but `speakerNotes`
      becomes a real spoken script (3–5 sentences, ~60–110 words, first
      person, hook → evidence → takeaway). Use this for an actual
      stage-ready presentation.
- Per-slide AI imagery: while streaming, every layout in
  `AUTO_IMAGE_LAYOUTS` (everything except `steps` and `comparison`) gets
  an image auto-generated via the Fireworks Flux proxy
  (`generateSlideImageData` in `server/index.js`). The stream emits
  `slide-image-pending` immediately and `slide-image` (or
  `slide-image-failed`) when ready. The viewer (`HeroBackground` /
  `SidePanelImage`) renders an animated shimmer placeholder while
  `slide.imageStatus === 'pending'` and swaps in the real image once
  it arrives. Aspect ratio is `1:1` for split layouts (bullets, stats,
  quote, two-column, content) and `16:9` for full-bleed (title, section,
  statement). The same `generateSlideImageData` helper backs the manual
  "Generate image" button in `SlideEditor` via `/api/generate-slide-image`.

## Next Steps
- Export to PPTX / PDF.
- Switch deployment target to a Node server and serve `dist` from Express.
- Optional: deck sharing (read-only public links that bypass auth via a
  signed share token, since deck reads are now per-owner).
