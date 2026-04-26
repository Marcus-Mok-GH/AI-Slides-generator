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
- (Future) Per-slide imagery: `gpt-image-1`.

## Stack
- **Frontend:** React 18 + Vite 5 (JavaScript)
- **Backend:** Node 20 + Express 5 (a small server that proxies AI calls)
- **Dev:** `concurrently` runs Vite (port 5000, public) and the API server
  (port 3001, localhost-only). Vite proxies `/api/*` → `127.0.0.1:3001`.

## Project Layout
```
.
├── index.html
├── package.json
├── vite.config.js              # Vite + /api proxy to localhost:3001
├── server/
│   ├── index.js                # Express app, routes, port 3001
│   └── generateDeck.js         # Orbitron call + JSON parsing/normalization
└── src/
    ├── main.jsx
    ├── App.jsx                 # Switches between Create view and Viewer
    ├── App.css                 # Layout grid
    ├── index.css               # Design tokens
    ├── lib/
    │   └── api.js              # Frontend fetch wrapper
    └── components/
        ├── Sidebar.jsx/css         # Left nav + folders + upgrade card
        ├── TopBar.jsx/css          # Search, notifications, avatar
        ├── CreateHero.jsx/css      # Prompt + format/length/tone/lang controls
        ├── TemplateRow.jsx/css     # Template gallery
        ├── RecentGallery.jsx/css   # Recent decks grid
        ├── SlideViewer.jsx/css     # Stage + thumbnails + notes + edit toggle
        └── SlideEditor.jsx/css     # Right-side properties panel for the
                                    # active slide (layout swap, inline edits,
                                    # AI regenerate)
```

## API
### `POST /api/generate-deck`
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
Returns `{ deck: { title, subtitle, theme, slides[], meta } }`.

Slide shape supports layouts: `title`, `content`, `two-column`, `bullets`,
`quote`, `stats`. The server validates and normalizes whatever the model returns
so the viewer never crashes on missing fields.

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
Returns `{ ok: true, hasKey: boolean }`.

## Editor flow
- Generated decks land in the **Slide Viewer** with editing on by default.
- The right-side **Slide Editor** panel exposes:
  - Layout selector (6 layouts)
  - Inline editable title, body, bullets, stats, quote, speaker notes
  - AI **Regenerate this slide** with optional instruction (calls
    `gpt-5-mini` via `/api/regenerate-slide`)
- Edits are local-only until the user navigates away (no persistence yet — see
  Next Steps).

## Required secrets
- `ORBITRON_API_KEY` — Orbitron gateway API key.

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

## Next Steps
- Persist generated decks (Replit DB or Postgres) so users can reopen them.
- Add per-slide image generation via `gpt-image-1`.
- Export to PPTX / PDF.
- Switch deployment target to a Node server and serve `dist` from Express.
