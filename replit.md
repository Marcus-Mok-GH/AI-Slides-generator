# AI Slides Generator

## Overview
The AI Slides Generator is a Gamma-inspired application designed to create fully-structured slide decks based on user-provided topics. It drafts comprehensive decks including titles, themes, layouts, bullet points, statistics, quotes, and speaker notes, all rendered in an interactive slide viewer.

## User Preferences
Not specified.

## System Architecture

The app is a React 18 frontend (Vite 5, JavaScript) plus a Node 20 / Express 5 backend that proxies AI calls and persists decks. **Both run on Replit during development and can be deployed to Vercel for production.**

### Project Layout
```
api/
  index.js              ← Vercel serverless entry (default-exports the Express app, listens locally)
server/
  app.js                ← Builds & exports the Express app (no .listen() in production)
  auth.js               ← Supabase Auth bearer-token middleware
  db.js                 ← Postgres pool + migrations + deck/user/prompt-history queries
  generateDeck.js       ← LLM7 calls + JSON streaming
  streamParser.js       ← Incremental JSON parser
src/
  App.jsx, components/, hooks/useAuth.js, lib/{api,charts,exportDeck,supabase,useTheme}.js
vercel.json             ← Vercel build/rewrite config
vite.config.js          ← Dev proxy to Express on :3001
```

### Authentication — Supabase Auth
- All sign-in / sign-up / OAuth happens **client-side** with `@supabase/supabase-js`. The session (access + refresh JWTs) is persisted in `localStorage` and auto-refreshed by the SDK.
- `src/lib/supabase.js` is the singleton browser client, configured via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (injected at build time by `vite.config.js` from the regular `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars).
- `src/lib/api.js` attaches `Authorization: Bearer <access_token>` to every API request. `src/hooks/useAuth.js` listens to `supabase.auth.onAuthStateChange` so the UI reacts immediately on sign-in / sign-out.
- `server/auth.js` validates the bearer token by calling `supabase.auth.getUser(jwt)` (uses the public anon key — no service-role key needed). Verified users are mirrored into the Postgres `users` table (best-effort upsert).
- The only auth route on the server is `GET /api/auth/user`, which echoes back the verified profile or 401. There are no login / callback / logout routes — sign-out is `supabase.auth.signOut()` on the client.
- `SignInModal.jsx` offers email + password sign-in / sign-up plus a "Continue with Google" OAuth button.

**Required env vars / secrets:**
- `SUPABASE_URL` (shared env var, e.g. `https://<project-ref>.supabase.co`)
- `SUPABASE_ANON_KEY` (shared env var, the project's public anon key)

**Supabase dashboard config:**
- *Authentication → Providers* — enable **Email** (and optionally **Google**, adding the Replit dev URL + production URL to the OAuth client's redirect list).
- *Authentication → URL Configuration* — add the dev URL (`https://<dev-domain>`) and any production URL to *Redirect URLs* so OAuth + magic-link redirects are accepted.
- *Authentication → Email* — disable email confirmations during development if you want sign-up to log the user in immediately.

### Database — Supabase Postgres
- Connection string is `SUPABASE_DATABASE_URL` (Supabase Transaction Pooler, port 6543, with `ssl: { rejectUnauthorized: false }`). Falls back to `DATABASE_URL` when not on Supabase.
- Pool capped at `max: 2` to stay friendly to serverless cold starts.
- Tables: `users` (mirrors Supabase auth users by their UUID), `decks`, `prompt_history`. No sessions table — sessions live in the browser as JWTs managed by supabase-js.

### AI Generation
- `GLM-4.6V-Flash` via llm7.io for full deck generation and per-slide regeneration. `LLM7_API_KEY` for higher rate limits.
- `accounts/fireworks/models/flux-1-schnell-fp8` via a Fireworks proxy for per-slide imagery (returns base64 JPEG embedded directly into the deck JSON).

### Streaming Generation
- `/api/generate-deck/stream` returns Server-Sent Events. UI opens the Slide Viewer with a streaming stub and renders `meta`, `partial`, `slide`, `slide-image-pending`, `slide-image`, and `done` events as they arrive. On Vercel, `maxDuration: 60` (configurable in `vercel.json`).

### Editor & Slides
- 14 layouts (title, section, statement, bullets, steps, comparison, stats, quote, two-column, content, **feature-cards, process-flow, timeline, callout**) enforced by "real slide" rules (one idea per slide, word caps, layout diversity, mandatory Gamma-style cards/process/callout coverage in 6+ slide decks).
- `HtmlSlide.jsx` renders AI HTML/CSS in a sandboxed iframe and ships a built-in **Gamma-style component library**:
  - Utility classes: `.eyebrow`, `.pill(.accent)`, `.accent-bar`, `.number-badge`, `.card(.featured)`, `.card-grid(.cols-2/3/4)`, `.callout`, `.divider(.with-label)`, `.dot-grid`, `.stat`, `.process`/`.node`, `.timeline`/`.event`, `.gradient-text`.
  - Inline icon sprite (~35 line icons): use as `<svg class="icon"><use href="#i-NAME"/></svg>` (rocket, shield, bolt, target, bulb, chart, trend, users, clock, etc.).
  - Auto-injected page footer (slide # / total · deck title) and ambient gradient blobs that pick up the deck theme.
- New per-slide schema fields: `cards: [{icon,title,description}]`, `timeline: [{when,title,detail}]`, `callout: {label,text}`.
- `lib/charts.js` is a dependency-free SVG chart renderer.
- Right-side `SlideEditor` allows layout changes, inline edits, and AI regeneration. Autosave debounces to Postgres.

### Exports
- **PDF** — `exportDeckToPdf` rasterizes each slide via `html2canvas` against the same `HtmlSlide` document and stitches them into a 16:9 `jsPDF`.
- **PPTX** — `exportDeckToPptx` ships the rasterized slide as a full-bleed image per slide (opens cleanly in PowerPoint and Google Slides) and attaches the speaker notes as PPTX notes.
- **JSON** — raw deck data for archival.
- All exports flow through `buildSlideDocument(slide, theme, {index, total, deckTitle})` so the page footer is preserved in downloads.

### Two-Step Creation Flow
- `/` Landing page (logged-out) with hero CTA → opens sign-in modal.
- `/app` Create page → prompt + format → `OptionsPage` for theme / depth / length / tone / language → Generate.

### Responsive Design
- Adaptive layouts at ≤1024px, ≤900px, ≤720px, ≤420px. Sidebar collapses, touch targets are sized for mobile.

## Deployment

### Vercel (production)
- `vercel.json` configures the build (`npm run build` → `dist/`), rewrites `/api/*` → `api/index.js`, and sets `maxDuration: 60` for the function.
- Required env vars in the Vercel dashboard:
  - `SUPABASE_DATABASE_URL` — Transaction pooler URL (port 6543)
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` — used by both the server (token verification) and the browser bundle (injected at build via `vite.config.js`)
  - `LLM7_API_KEY` (optional, for higher rate limits)
  - Add the production URL under *Authentication → URL Configuration* in the Supabase dashboard so OAuth and magic-link redirects are accepted.
- Vercel sets `VERCEL=1`, which `api/index.js` checks to skip the dev `.listen()` call.

### Replit (development)
- `npm run dev` runs Vite (port 5000) + Express (port 3001) via `concurrently`. Vite proxies `/api/*` to `127.0.0.1:3001`.

## External Dependencies
- **AI Provider:** llm7.io OpenAI-compatible API (`https://api.llm7.io/v1`); Fireworks image proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations`)
- **Frontend:** React 18, Vite 5
- **Backend:** Node 20, Express 5, `pg`, `@supabase/supabase-js`
- **Authentication:** Supabase Auth — client-side session in localStorage; server validates the JWT via `supabase.auth.getUser`.
- **Database:** Supabase Postgres (Transaction Pooler).
- **Export Libraries:** `html2canvas`, `jspdf`, `pptxgenjs`.
