# AI Slides Generator

AI Slides Generator helps you turn a rough idea into a clean, presentation-ready slide deck in minutes.

You type a topic, choose how short or detailed you want the result, and the app builds slides with:
- clear structure
- visual layouts
- key talking points
- optional images
- speaker notes to guide delivery

It is designed for people who want to move from “blank page” to a strong first draft quickly.

---

## What this project is for

This project is for creating slide decks faster without starting from scratch.

Typical use cases:
- Class presentations
- Team updates
- Sales or client briefings
- Workshop outlines
- Research summaries

Instead of manually formatting every slide, you can focus on your message and then edit the generated content.

---

## How it works (simple view)

1. **Enter a topic**  
   Example: “AI trends in healthcare”.

2. **Choose length and style**  
   You can make a short, punchy deck or a more detailed one.

3. **Watch slides appear live**  
   The deck is generated progressively so you see results quickly.

4. **Review and edit**  
   Update text, regenerate parts, and refine your story.

5. **Save your deck**  
   Your work is saved so you can return later.

---

## Main features

- **Fast first draft generation** from one prompt.
- **Live slide streaming** so you don’t wait for everything to finish.
- **Built-in layout variety** to avoid repetitive decks.
- **Speaker notes** for presentation support.
- **Optional AI images** to make slides more visual.
- **Auto-save behavior** to reduce lost work.
- **Simple browser-based editing experience**.

---

## Who this is best for

- Students preparing presentations quickly
- Founders/teams making update decks
- Consultants shaping client narratives
- Educators building lesson slides
- Anyone who wants a strong draft before manual polishing

---

## Tech stack (high level)

This app has:
- a **frontend** (what users see in the browser)
- a **backend** (handles generation, auth checks, and saving)
- a **database** (stores decks and session data)
- external **AI services** (text + image generation)

If you want deeper implementation details, see `AGENTS.md` and `replit.md`.

---

## Authentication and data notes

This project currently uses **Supabase Auth** for sign-in and identity verification.

Please keep this auth setup intact unless you are intentionally planning a full auth migration.

Environment variables used by this project include:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `SUPABASE_DATABASE_URL` (optional alternative)

---

## Local setup

### 1) Install dependencies

```bash
npm install
```

### 2) Start in development mode

```bash
npm run dev
```

This starts the app for local development with frontend + backend running together.

### 3) Build for production

```bash
npm run build
```

### 4) Start production server

```bash
npm start
```

---

## Project layout (quick guide)

- `src/` → frontend interface and slide editing experience
- `server/` → core backend logic
- `api/` → deployment wrapper for serverless-style entry
- `README.md` → project overview (this file)
- `AGENTS.md` → deep technical and architecture reference

---

## Known limitations

Current limitations include:
- No real-time multi-user collaboration
- No built-in version history for deck revisions
- No offline export to PDF/PPTX yet
- Mobile editing is more limited than desktop

---

## Contributing

Contributions are welcome. For best results:
1. Read this README first.
2. Review `AGENTS.md` for architecture and project conventions.
3. Keep changes user-focused and easy to understand.

---

## License

Add your preferred license here (MIT, Apache-2.0, proprietary, etc.).
