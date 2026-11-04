# AI Slides Generator

AI Slides Generator helps you turn a rough idea into a clean, presentation-ready slide deck in minutes.

You type a topic, choose how short or detailed you want the result, and the app builds slides with:
- clear structure
- visual layouts
- key talking points
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
- a **database** (stores accounts and decks)
- an external **AI service** for text generation (Pollinations AI)

If you want deeper implementation details, see `AGENTS.md`.

---

## Authentication and data notes

Accounts are self-hosted: email + password, hashed with **bcryptjs**, with a
**JWT** kept in `localStorage` under `slideai:token`. `src/lib/api.js` attaches
it to every request and clears it on a 401. There is no Supabase Auth and no
session table — the JWT carries identity, so no session store is read per request.

Environment variables used by this project:

- `POSTGRES_URL` — Neon Postgres connection string (Vercel Storage). No fallback env vars are read.
- `JWT_SECRET` — signing key for auth tokens; use a long random value in production
- `POLLINATIONS_API_KEY` — required for deck generation and Agent Five
- `GOOGLE_CLIENT_ID` — optional; enables "Continue with Google" on the login page. Create a Web OAuth client in Google Cloud Console and add every app origin (local dev + production) to its Authorized JavaScript origins. When unset, the Google button is hidden and `POST /api/auth/google` returns 503.

Rotating `JWT_SECRET` logs every existing user out, so change it deliberately.

---

## Local setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure the environment

Create a `.env` file (it is git-ignored) with at least:

```bash
POSTGRES_URL="postgres://user:pass@localhost:5432/slides"
JWT_SECRET="any-long-random-string"
POLLINATIONS_API_KEY="pollinations-key"
```

On a fresh database, create the schema once:

```bash
npm run db:init
```

### 3) Start in development mode

```bash
npm run dev
```

This starts the app for local development with frontend + backend running together.

### 4) Run the tests

```bash
npm test
```

### 5) Build for production

```bash
npm run build
```

This builds the frontend and regenerates `api/index.js` (the Vercel bundle) with
`npm run api:build`.

### 6) Start production server

```bash
npm start
```

---

## Deploying to Vercel

Only three functions are deployed: `api/index.js`, `api/health.mjs` and
`api/diag.mjs`. Vercel turns every supported file directly inside `api/` into
its own function, and the Hobby plan allows 12 functions per deployment, so all
backend code lives in `server/` and is never placed under `api/`.

`api/index.js` is a build artifact, not hand-written source. `npm run build`
(or `npm run api:build`) bundles `serverless/entry.js` into a single
self-contained CommonJS file with esbuild. Vercel decides ESM vs CommonJS per
file at load time, and the app's ESM source kept being parsed as CommonJS there
(`Cannot use import statement outside a module`); one bundled CJS file removes
that ambiguity. Never edit `api/index.js` by hand, and re-run the build after
changing anything in `server/`.

Note `api/package.json` sets `"type": "commonjs"` so the bundle is read as CJS,
which is why the health and diag functions use the `.mjs` extension.

Check a deployment with:

- `GET /api/health` — runtime, region, commit, whether a database is configured
- `GET /api/diag` — imports each package/module in isolation and reports the one that fails (`?db=1` also exercises the database pool)

Required environment variables: `POSTGRES_URL` (Neon Postgres connection
string), `JWT_SECRET`, and `POLLINATIONS_API_KEY`.

Text generation goes through Pollinations AI (`https://gen.pollinations.ai/v1`,
OpenAI-compatible) using `openai/gpt-6-luna`. Override with
`POLLINATIONS_BASE_URL`, `POLLINATIONS_DECK_MODEL`, `POLLINATIONS_SLIDE_MODEL`
and `POLLINATIONS_AGENT_MODEL` if you want a different model per workload.
Get a key at https://enter.pollinations.ai/keys.

---

## Project layout (quick guide)

- `src/` → frontend interface and slide editing experience
- `api/` → Vercel functions only (`index.js` built bundle, `health.mjs`, `diag.mjs`)
- `server/` → the backend source of truth (Express app, routes, db, exporters)
- `serverless/entry.js` → entrypoint bundled into `api/index.js`; also runs `npm run dev`
- `README.md` → project overview (this file)
- `AGENTS.md` → deep technical and architecture reference

---

## Known limitations

Current limitations include:
- No real-time multi-user collaboration
- No built-in version history for deck revisions
- PDF/PPTX export needs a headless Chrome; on plain serverless hosts it returns a clear "browser unavailable" error
- Mobile editing is more limited than desktop
- Slides are generated without images: the third-party image provider used previously is offline, so Agent Five's image tool fails while deck generation is unaffected

---

## Contributing

Contributions are welcome. For best results:
1. Read this README first.
2. Review `AGENTS.md` for architecture and project conventions.
3. Keep changes user-focused and easy to understand.

---

## License

Add your preferred license here (MIT, Apache-2.0, proprietary, etc.).
