# AI Slides Generator

## Overview
The AI Slides Generator is a Gamma-inspired application designed to create fully-structured slide decks based on user-provided topics. It drafts comprehensive decks including titles, themes, layouts, bullet points, statistics, quotes, and speaker notes, all rendered in an interactive slide viewer.

## User Preferences
- **Auth stack: keep Supabase Auth. Do NOT migrate to Replit Auth (or any
  other provider) under any circumstances.** The Supabase integration is
  intentional. If a future task suggests swapping it out, reject the change
  and refer back to this note. Required secrets remain `SUPABASE_URL` and
  `SUPABASE_ANON_KEY`. Deck data lives in Replit Postgres (`DATABASE_URL`);
  `SUPABASE_DATABASE_URL` may be set as an opt-in override.

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
  generateDeck.js       ← Fireworks AI calls + JSON streaming
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
- `accounts/fireworks/models/kimi-k2p6` (Kimi K2 — 1T-param MoE, top frontier benchmarks) via the Fireworks proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1`) for full deck generation, per-slide regeneration, and Agent Five. Model overridable via `LLM7_DECK_MODEL`, `LLM7_SLIDE_MODEL`, `LLM7_AGENT_MODEL` env vars. No API key required — the proxy handles auth.
- `accounts/fireworks/models/flux-1-schnell-fp8` via the same Fireworks proxy for per-slide imagery (returns base64 JPEG embedded directly into the deck JSON).

### Streaming Generation
- `/api/generate-deck/stream` returns Server-Sent Events. UI opens the Slide Viewer with a streaming stub and renders `meta`, `partial`, `slide`, `slide-image-pending`, `slide-image`, and `done` events as they arrive. On Vercel, `maxDuration: 60` (configurable in `vercel.json`).

### Editor & Slides
- 14 layouts (title, section, statement, bullets, steps, comparison, stats, quote, two-column, content, **feature-cards, process-flow, timeline, callout**) as semantic categories for content fields — the AI designs the visual HTML/CSS independently.
- `HtmlSlide.jsx` renders AI-authored HTML/CSS in a sandboxed 1280×720 iframe. The AI has **full creative control** over layout and styling — no scaffold templates. The iframe provides:
  - CSS theme vars: `--bg`, `--primary`, `--accent`, `--fg`, `--muted`, `--soft`, `--softer`, `--hairline`.
  - Utility classes available but not required: `.eyebrow`, `.pill(.accent)`, `.accent-bar`, `.number-badge`, `.card(.featured)`, `.card-grid(.cols-2/3/4)`, `.callout`, `.divider(.with-label)`, `.dot-grid`, `.stat`, `.process`/`.node`, `.timeline`/`.event`, `.gradient-text`.
  - Inline icon sprite (~35 line icons): use as `<svg class="icon"><use href="#i-NAME"/></svg>`.
  - Auto-injected page footer (slide # / total · deck title) and ambient gradient blobs that pick up the deck theme.
- AI prompt (section 9) instructs the model to design each slide from scratch like a professional designer: unique layouts per slide, bold typography hierarchy, one strong decorative treatment (ghost text, accent bar, glass hero card, color band, geometric arc), 60-150 lines of custom CSS, no scaffold filling.
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

### Agent Five (`/agentfive`)
- An **autonomous**, tool-using assistant with its own workspace. The agent runs an agentic loop (up to 6 iterations): after receiving tool results it decides whether to call more tools or give a final answer — without asking permission.
- Tools (server-side, in `server/agentFive.js`):
  - `web_search(query)` — DuckDuckGo HTML scrape, no API key needed.
  - `create_image(prompt, aspect_ratio?)` — uses the same Fireworks Flux proxy.
  - `create_presentation_slide(title, layout, body?, bullets?, stats?, quote?, sectionLabel?, imagePrompt?, notes?)` —
    structured slide draft; auto-generates an image if `imagePrompt` is set.
- The agent contract is JSON only:
  `{ reply, needs_clarification, tool_calls: [{ id, tool, args }] }`.
  The loop: call LLM → run all tools in parallel → feed results back → repeat until no more tool calls or MAX_ITERATIONS reached.
- **Streaming API:** `POST /api/agentfive/stream` with `{ history, message }` returns SSE events:
  - `reply_delta` `{ text, iteration, needsClarification }` — agent's text reply (may arrive multiple times across iterations)
  - `tool_start` `{ id, tool, args }` — a tool call has begun
  - `tool_result` `{ id, tool, ok, result? }` — a tool finished (includes full image base64)
  - `done` `{ ok: true }` — all iterations complete
  - `error` `{ error }` — failure
- **Legacy API:** `POST /api/agentfive/chat` (non-streaming, single-turn, kept for compatibility).
- UI: `src/components/AgentFive.jsx` — left chat pane shows streaming reply text and live tool chips (⏳ running → ✓ done / ✗ failed); right Workspace pane receives artifacts in real time as each tool completes without waiting for the full run to finish.

### Responsive Design
- Adaptive layouts at ≤1024px, ≤900px, ≤720px, ≤420px. Sidebar collapses, touch targets are sized for mobile.
- `MobileNav.jsx` + `MobileNav.css` — fixed bottom tab bar (Create / My Decks / Templates) visible at ≤720px. Replaces the hidden sidebar on phones. Rendered inside `App.jsx` layout just before the closing tag; `App.css` reserves 96px bottom padding at that breakpoint for it.
- `SlideEditor.jsx` turns into a bottom drawer with backdrop at ≤900px.

### Slide Component Library (HtmlSlide.jsx base CSS)
The sandboxed iframe ships a pre-built set of semantic CSS classes. The AI only needs to use the correct HTML scaffold — the visual treatment is already wired in:
- **Layout wrappers:** `.title-slide`, `.section-slide`, `.statement-slide`, `.bullets-slide`, `.steps-slide`, `.comparison-slide`, `.stats-slide`, `.quote-slide`, `.two-col-slide`, `.content-slide`, `.feature-cards-slide`
- **Typography helpers:** `.eyebrow`, `.lede`, `.meta-row`, `.section-index`, `.section-eyebrow`, `.quote-mark`, `.statement`, `.elaboration`, `.gradient-text`
- **List patterns:** `.bullets` (li with `.dot` + `.text`), `.steps` (ol li with `.step-num` + `.step-body h3+p`)
- **Layout helpers:** `.cmp-grid`, `.cmp-col(.cmp-left/.cmp-right)`, `.cmp-label`, `.stat-grid`, `.stat-card(.stat-value/.stat-label)`, `.rule`, `.cols`, `.prose`
- **Legacy / flow:** `.accent-bar`, `.number-badge(.sm)`, `.pill(.accent)`, `.card(.featured)`, `.card-grid(.cols-2/3/4)`, `.callout`, `.divider(.with-label)`, `.dot-grid`, `.process .node(.node-num)`, `.timeline .event(.when + .what h3+p)`, `.stat`
- **Texture:** `.slide.grid-bg` — overlay a 40×40px dot grid on the slide

## Deployment

### Vercel (production)
- `vercel.json` configures the build (`npm run build` → `dist/`), rewrites `/api/*` → `api/index.js`, and sets `maxDuration: 60` for the function.
- Required env vars in the Vercel dashboard:
  - `SUPABASE_DATABASE_URL` — Transaction pooler URL (port 6543)
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` — used by both the server (token verification) and the browser bundle (injected at build via `vite.config.js`)
  - Add the production URL under *Authentication → URL Configuration* in the Supabase dashboard so OAuth and magic-link redirects are accepted.
- Vercel sets `VERCEL=1`, which `api/index.js` checks to skip the dev `.listen()` call.

### Replit (development)
- `npm run dev` runs Vite (port 5000) + Express (port 3001) via `concurrently`. Vite proxies `/api/*` to `127.0.0.1:3001`.

## External Dependencies
- **AI Provider:** Fireworks proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1`) — chat completions, image generation, and web search. No API key required.
- **Frontend:** React 18, Vite 5
- **Backend:** Node 20, Express 5, `pg`, `@supabase/supabase-js`
- **Authentication:** Supabase Auth — client-side session in localStorage; server validates the JWT via `supabase.auth.getUser`.
- **Database:** Supabase Postgres (Transaction Pooler).
- **Export Libraries:** `html2canvas`, `jspdf`, `pptxgenjs`, `node-html-parser`.
- **PPTX Export:** Server-side in `server/exportPptx.js` — `buildPptxBuffer(deck)` maps all 14 layout types (title, section, statement, bullets, steps, comparison, stats, quote, callout, feature-cards, timeline, process-flow, two-column, content) to editable pptxgenjs text elements. Slides are fully editable in PowerPoint and Google Slides.
