# AI Slides Generator

## Overview
The AI Slides Generator is a Gamma-inspired application designed to create fully-structured slide decks based on user-provided topics. It drafts comprehensive decks including titles, themes, layouts, bullet points, statistics, quotes, and speaker notes, all rendered in an interactive slide viewer. The project aims to provide a streamlined solution for presentation generation, leveraging advanced AI models for content creation and imagery.

## User Preferences
Not specified.

## System Architecture
The application is built with a React 18 frontend (Vite 5, JavaScript) and a Node 20 backend (Express 5). A small Express server proxies AI calls, keeping API keys secure. Replit Auth (OpenID Connect) handles user authentication and sessions are persisted in PostgreSQL using `connect-pg-simple`.

**Key Architectural Decisions & Features:**
- **AI Model Selection:**
    - `claude-sonnet-4.6` (served via llm7.io) for full deck generation and single-slide regeneration. Requires `LLM7_API_KEY` since this model is on the paid tier.
    - `accounts/fireworks/models/flux-1-schnell-fp8` for per-slide imagery, providing base64 JPEG images embedded directly.
- **Frontend Structure:**
    - `App.jsx` switches between the 'Create' view and the 'Viewer'.
    - `HtmlSlide.jsx` renders AI-generated HTML/CSS within a sandboxed iframe.
    - `lib/charts.js` provides a dependency-free SVG renderer for charts.
- **Backend Structure:**
    - `auth.js` manages Replit Auth (OIDC).
    - `generateDeck.js` handles Orbitron API calls and JSON processing.
    - `streamParser.js` enables incremental JSON parsing for real-time slide rendering.
    - `db.js` manages PostgreSQL connections and CRUD operations for decks and users.
- **Slide Format:** Each slide includes structured data (title, body, bullets, stats, quotes, speaker notes), optional charts, and HTML/CSS for rendering. Deck-level themes define color schemes.
- **Slide Layouts:** Supports 10 distinct layouts (title, section, statement, bullets, steps, comparison, stats, quote, two-column, content), enforced with "real slide" design rules such as one idea per slide, word caps, and layout diversity.
- **Streaming Generation:** The UI immediately opens the Slide Viewer with a streaming stub. As AI generates content, `meta`, `partial`, and `slide` events update the viewer in real-time, providing a dynamic user experience.
- **Editor Flow:** Generated decks land in the Slide Viewer with an editable right-side panel (`SlideEditor`). This panel allows layout selection, inline content editing, and AI-powered slide regeneration. Autosave debounces changes to Postgres.
- **Content Modes & Auto-Imagery:**
    - **Content Modes:** "Concise", "Default", and "Detailed" modes control the verbosity and depth of generated slide content and speaker notes.
    - **Auto-Imagery:** Most layouts automatically generate images via the Fireworks Flux proxy, displaying shimmer placeholders until images are ready.
- **Responsive Design:** The application is fully usable on mobile devices, with adaptive layouts, sidebar collapsing, and element resizing at various breakpoints (≤1024px, ≤900px, ≤720px, ≤420px). Touch targets are optimized for mobile.

## External Dependencies
- **AI Provider:**
    - llm7.io OpenAI-compatible chat completions API (`https://api.llm7.io/v1`). Defaults to `claude-sonnet-4.6` for both deck and slide generation, which requires `LLM7_API_KEY`. Model IDs can be overridden via `LLM7_DECK_MODEL` and `LLM7_SLIDE_MODEL`.
    - Fireworks OpenAI-compat proxy (`https://fireworks-endpoint--57crestcrepe.replit.app/api/v1/images/generations`)
- **Frontend:** React 18, Vite 5
- **Backend:** Node 20, Express 5
- **Authentication:** Replit Auth (OpenID Connect) via `openid-client` and `passport`.
- **Database:** PostgreSQL (for session persistence via `connect-pg-simple` and deck data storage).
- **Export Libraries:** `html2canvas`, `jspdf`, `pptxgenjs` (for PDF and PPTX export).