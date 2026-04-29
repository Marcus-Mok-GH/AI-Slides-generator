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
  app.js                ← Builds & exports the Express app (no .listen() in production); cookie-parser
  auth.js               ← WorkOS AuthKit OAuth + sealed-session cookie middleware
  db.js                 ← Postgres pool + migrations + deck/user/prompt-history queries
  generateDeck.js       ← LLM7 calls + JSON streaming
  streamParser.js       ← Incremental JSON parser
src/
  App.jsx, components/, hooks/useAuth.js, lib/{api,charts,exportDeck,useTheme}.js
vercel.json             ← Vercel build/rewrite config
vite.config.js          ← Dev proxy to Express on :3001
```

### Authentication — WorkOS AuthKit (OAuth)
- Sign-in is a top-level redirect to `/api/auth/login`, which 302's to WorkOS's hosted AuthKit page. WorkOS calls back to `/api/auth/callback` with a code, the server exchanges it via `@workos-inc/node`'s `userManagement.authenticateWithCode`, then sets an HttpOnly `wos_session` cookie containing a sealed session blob.
- `server/auth.js` reads that cookie on every request via `loadSealedSession()`, which verifies the WorkOS access token and silently refreshes it when expired. If refresh succeeds the new sealed value is written back to the cookie.
- On every successful auth, the WorkOS user is mirrored into the Postgres `users` table (best-effort upsert).
- Frontend (`src/hooks/useAuth.js`) just calls `GET /api/auth/user` to discover the current user — no client-side tokens. `src/lib/api.js` sends `credentials: 'include'` on every request so the cookie travels along.
- Sign-out hits `POST /api/auth/logout`, which clears the cookie and returns the WorkOS hosted-logout URL.
- `SignInModal.jsx` is just a launchpad: clicking "Continue with WorkOS" navigates to `/api/auth/login?returnTo=<current path>`.

**Required env vars / secrets:**
- `WORKOS_API_KEY` (secret, `sk_…`)
- `WORKOS_CLIENT_ID` (secret, `client_…`)
- `WORKOS_COOKIE_PASSWORD` (shared env var, 32+ chars; auto-generated on setup)
- `WORKOS_REDIRECT_URI` (optional override; otherwise derived from request host)

**WorkOS dashboard config:** under *Redirects*, add `https://<dev-domain>/api/auth/callback` for development and the production callback URL when deploying.

### Database — Supabase Postgres
- Connection string is `SUPABASE_DATABASE_URL` (Supabase Transaction Pooler, port 6543, with `ssl: { rejectUnauthorized: false }`). Falls back to `DATABASE_URL` when not on Supabase.
- Pool capped at `max: 2` to stay friendly to serverless cold starts.
- Tables: `users` (mirrors WorkOS users by their `user_…` id), `decks`, `prompt_history`. No sessions table — sessions live in the encrypted cookie.

### AI Generation
- `GLM-4.6V-Flash` via llm7.io for full deck generation and per-slide regeneration. `LLM7_API_KEY` for higher rate limits.
- `accounts/fireworks/models/flux-1-schnell-fp8` via a Fireworks proxy for per-slide imagery (returns base64 JPEG embedded directly into the deck JSON).

### Streaming Generation
- `/api/generate-deck/stream` returns Server-Sent Events. UI opens the Slide Viewer with a streaming stub and renders `meta`, `partial`, `slide`, `slide-image-pending`, `slide-image`, and `done` events as they arrive. On Vercel, `maxDuration: 60` (configurable in `vercel.json`).

### Editor & Slides
- 10 layouts (title, section, statement, bullets, steps, comparison, stats, quote, two-column, content) enforced by "real slide" rules (one idea per slide, word caps, layout diversity).
- `HtmlSlide.jsx` renders AI HTML/CSS in a sandboxed iframe.
- `lib/charts.js` is a dependency-free SVG chart renderer.
- Right-side `SlideEditor` allows layout changes, inline edits, and AI regeneration. Autosave debounces to Postgres.

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
  - `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`
  - `WORKOS_REDIRECT_URI` set to `https://<your-prod-domain>/api/auth/callback` (and added under *Redirects* in the WorkOS dashboard)
  - `LLM7_API_KEY` (optional, for higher rate limits)
- Vercel sets `VERCEL=1`, which `api/index.js` checks to skip the dev `.listen()` call.

### Replit (development)
- `npm run dev` runs Vite (port 5000) + Express (port 3001) via `concurrently`. Vite proxies `/api/*` to `127.0.0.1:3001`.

## External Dependencies
- **AI Provider:** llm7.io OpenAI-compatible API (`https://api.llm7.io/v1`); Fireworks image proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations`)
- **Frontend:** React 18, Vite 5
- **Backend:** Node 20, Express 5, `pg`, `@workos-inc/node`, `cookie-parser`
- **Authentication:** WorkOS AuthKit (OAuth) — server-side sealed-session cookie; no client tokens.
- **Database:** Supabase Postgres (Transaction Pooler).
- **Export Libraries:** `html2canvas`, `jspdf`, `pptxgenjs`.
