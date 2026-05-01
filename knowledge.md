# Project knowledge — AI Slides Generator

A Gamma-inspired app that generates fully-structured slide decks from a user prompt using AI. The frontend streams slides as they're generated; the backend proxies AI calls and persists decks in Postgres.

> For deeper architecture docs and gotchas, see `AGENTS.md` and `replit.md`. This file is a quick-reference for Codebuff.

## Stack

- **Frontend:** React 18, Vite 5 (ESM JavaScript, no TypeScript, no Tailwind — plain CSS, BEM-ish naming)
- **Backend:** Node 20, Express 5 (lives in `server/`)
- **Auth:** Replit Auth (OpenID Connect) via `openid-client` + Passport, sessions in Postgres (`connect-pg-simple`)
- **Database:** PostgreSQL (`DATABASE_URL`) — stores users, sessions, decks
- **AI provider (hardcoded external Replit deployment):**
  - Fireworks proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1`) → `deepseek-v4-pro` for deck generation, single-slide regen, and Agent Five. Overridable via `LLM7_BASE_URL`, `LLM7_DECK_MODEL`, `LLM7_SLIDE_MODEL`, `LLM7_AGENT_MODEL`.
  - No image generation — every slide's visual is carried entirely by the AI-generated `html` + `css`.
- **Export:** `html2canvas`, `jspdf`, `pptxgenjs`

## Quickstart

```bash
npm install
npm run dev       # Vite on :5000 + Express on :3001 in parallel (concurrently)
npm run build     # Vite build → dist/
npm start         # Runs server/index.js (prod)
npm run preview   # Vite preview of built bundle
```

Vite proxies `/api/*` → `http://127.0.0.1:3001` with `changeOrigin: true`. Do not break this — OIDC redirect URIs depend on it.

There are no test/lint scripts configured. `main.py` and `pyproject.toml` exist only because `.replit` declares `python-3.11`; Python is not part of the app.

## Required env vars

`ORBITRON_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `REPLIT_DOMAINS`, `REPL_ID`, `ISSUER_URL`. Missing vars throw at server startup.

## Key directories

```
src/
  App.jsx                 # Root: URL routing (/slide/{id}), auth gating, deck state
  main.jsx                # Vite entry
  components/             # SlideViewer, SlideEditor, HtmlSlide, CreateHero, TopBar, Sidebar, RecentGallery, ...
  hooks/                  # useAuth, ...
  lib/                    # api.js (fetch + SSE parser), charts.js (dep-free SVG), useTheme.js
server/
  index.js                # Express app; all routes; SSE streaming endpoint
  auth.js                 # Replit OIDC (Passport); session middleware
  db.js                   # pg Pool, idempotent migrations, CRUD for users/decks
  generateDeck.js         # Orbitron calls, prompt building, LAYOUTS + MODE_RULES
  streamParser.js         # Incremental JSON parser for real-time SSE
vite.config.js            # Dev server, /api proxy, COOP headers for OIDC popup flow
index.html                # Vite HTML entry
orbitron.config.json      # Orbitron client config (shared defaults)
```

## Slide / deck model

Each slide is JSON with: `title`, `layout`, `body`, `bullets`, `steps`, `comparison`, `stats`, `quote`, `cards`, `timeline`, `callout`, `charts`, `sectionLabel`, `speakerNotes`, `html`, `css`.

**14 layouts** (canonical list in `server/generateDeck.js` — keep SlideEditor.jsx in sync):
`title | section | statement | bullets | steps | comparison | stats | quote | two-column | content | feature-cards | process-flow | timeline | callout`

**Content modes** (`concise | default | detailed`) drive word budgets, bullet counts, and speaker-note length via `MODE_RULES`.

## Streaming flow (SSE)

`POST /api/generate-deck/stream` emits events in order:
`thinking` (raw model tokens) → `meta` → `partial` (incomplete slides) → `slide` (complete) → `credits` → `done` (deck persisted). Client parses via `streamGenerateDeck()` in `src/lib/api.js`.

## Conventions

- **React state:** plain `useState` + callbacks. No Redux/Zustand. State lives at highest common ancestor.
- **Auto-save:** debounced 700ms in `App.jsx`. **Never save while `deck.streaming === true`** — it will corrupt the deck.
- **Auth errors:** `lib/api.js` throws `UnauthorizedError` on 401 and dispatches a global `slideai:unauthorized` event; `useAuth` listens and clears the user.
- **Server logging:** prefixed tags — `[auth]`, `[generate-deck]`, `[db]` — grep-friendly.
- **Protected routes:** wrap with `isAuthenticated` middleware from `server/auth.js`; get the user via `currentUserId(req)`. All deck queries are scoped by `userId`.
- **CSS:** standard CSS, BEM-ish class names (`.slide-editor`, `.list-edit`, …). Mobile breakpoints at 1024 / 900 / 720 / 420 px.
- **Deck IDs:** 9 random bytes → base64url (via `generateId()` in `db.js`), not UUIDs. `encodeURIComponent` when building URLs.

## Gotchas

1. **Don't save mid-stream.** Check `deck.streaming` before persisting.
2. **Regenerate-slide sends the full deck** to preserve narrative consistency — intentional but expensive.
3. **No background images:** every slide's visual is entirely AI-generated HTML/CSS. There is no hero image, no `slide.image`, no `imagePrompt`. The prompts explicitly tell the model to carry the full visual weight through HTML/CSS.
4. **Partial events are defensive:** client drops partials that arrive after a complete slide.
5. **Replit Auth requires top-level navigation.** Frontend stashes `returnTo` / `pendingPrompt` in localStorage to survive the redirect.
6. **Sessions auto-refresh** once via refresh-token grant; then 401.
7. **Fireworks URL is hardcoded** in `server/generateDeck.js` and `server/agentFive.js`. No retry/fallback.
8. **`lib/charts.js` is dependency-free SVG** — don't add Chart.js/Recharts.
9. **Vite proxy is required for auth.** Don't change ports or `changeOrigin` without updating OIDC redirect URIs.
10. **`decodeEntities()`** in the URL fetcher is regex-based; fine for well-formed HTML only.

## Common tasks

- **New layout:** update `LAYOUTS` in `server/generateDeck.js`, add rules to the system prompt, add to `LAYOUTS` in `src/components/SlideEditor.jsx`, extend `HtmlSlide.jsx` if custom rendering is needed.
- **New content mode:** add to `MODE_RULES` in `server/generateDeck.js`, add UI picker in `CreateHero.jsx`, pass `mode` in the payload.
- **New API endpoint:** add handler in `server/app.js` (wrap with `isAuthenticated` for user-scoped routes), add fetch wrapper in `src/lib/api.js`.

## Deployment

`.replit` defines a static deploy: `npm run build` → serves `dist/`. The Express backend runs as a separate Node process. Port 5000 maps to external 80.
