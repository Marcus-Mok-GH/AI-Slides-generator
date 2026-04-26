# AI Slides Generator

## Overview
A Gamma-inspired scaffold UI for an AI-powered slide deck generator. The
current build is the front-end shell only — the prompt input and "Generate"
button are wired but no AI provider or slide engine is connected yet.

## Stack
- **Frontend:** React 18 + Vite 5 (JavaScript)
- **Runtime:** Node.js 20
- **Dev server:** Vite, bound to `0.0.0.0:5000`, all hosts allowed (required
  for the Replit iframe proxy)

## Project Layout
```
.
├── index.html              # Vite HTML entry
├── package.json            # npm scripts and deps
├── vite.config.js          # Dev/preview server configuration
└── src/
    ├── main.jsx            # React bootstrap
    ├── App.jsx             # Page composition
    ├── App.css             # Layout grid (sidebar + main)
    ├── index.css           # Global tokens (colors, radii, shadows)
    └── components/
        ├── Sidebar.jsx/css       # Left nav, workspaces, upgrade card
        ├── TopBar.jsx/css        # Search, notifications, avatar
        ├── CreateHero.jsx/css    # Prompt area, format/length/tone controls
        ├── TemplateRow.jsx/css   # "Start from a template" gallery
        └── RecentGallery.jsx/css # Recent decks grid
```

## UI structure (Gamma-inspired)
- **Sidebar:** primary "New" CTA, navigation, workspace folders, Pro upgrade.
- **Top bar:** global search with ⌘K hint, notifications, avatar.
- **Create hero:** format tabs (Presentation / Document / Webpage / Social),
  prompt textarea with Paste / Import / URL chips, length & tone segmented
  controls, language select, and the gradient "Generate" button. Also shows
  example prompt suggestions that fill the textarea on click.
- **Template row:** quick-start templates with gradient thumbnails.
- **Recent decks:** grid of recent deck cards with thumbnails and metadata.

## Workflow
- `Start application` runs `npm run dev` and serves on port 5000 (webview).

## Deployment
Configured as a `static` deployment:
- Build: `npm run build`
- Public directory: `dist`

## Next Steps
This is a UI scaffold only. Likely follow-ups:
- Wire the "Generate" button to an AI provider to produce slide outlines.
- Add a slide editor view (open a deck, edit cards, change theme).
- Persist decks (Replit DB or Postgres) and add auth for per-user libraries.
- Export to PPTX / PDF.
