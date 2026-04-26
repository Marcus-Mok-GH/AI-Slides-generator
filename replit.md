# AI Slides Generator

## Overview
Imported from the GitHub repo `Sjdjdiejdrirhdkjej/AI-Slides-generator`. The
upstream repository was empty (0 bytes), so the project was bootstrapped with a
minimal scaffold that displays a landing page and is ready to be built out into
an AI-powered slide deck generator.

## Stack
- **Frontend:** React 18 + Vite 5 (JavaScript)
- **Runtime:** Node.js 20
- **Dev server:** Vite, bound to `0.0.0.0:5000`, all hosts allowed (required
  for the Replit iframe proxy)

## Project Layout
```
.
├── index.html          # Vite HTML entry
├── package.json        # npm scripts and deps
├── vite.config.js      # Dev/preview server configuration (port 5000, allowedHosts)
└── src/
    ├── main.jsx        # React bootstrap
    ├── App.jsx         # Landing page component
    ├── App.css         # Page styles
    └── index.css       # Global styles
```

## Workflow
- `Start application` runs `npm run dev` and serves on port 5000 (webview).

## Deployment
Configured as a `static` deployment:
- Build: `npm run build`
- Public directory: `dist`

## Next Steps
The scaffold is intentionally minimal. The user should specify the desired
features (AI provider, slide editor, export formats, etc.) so the application
can be built out.
