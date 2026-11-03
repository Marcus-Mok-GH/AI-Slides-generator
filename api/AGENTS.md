# API DIRECTORY (Vercel functions)

**Layout rule — do not break this:**

```
api/
├── index.js      # the one Express function (all app routes)
├── health.js     # dependency-free health probe
├── diag.js       # dependency-free import/pool diagnostics
└── _lib/         # ALL shared backend code lives here
```

Vercel turns every supported file directly inside `api/` into its own function,
and the Hobby plan allows 12 functions per deployment. Files and folders whose
name starts with `_` are ignored by that routing, which is why shared code must
stay in `api/_lib/`. Adding a new `.js` file directly under `api/` costs you a
function slot.

**Init rules:**

- No top-level `await` in anything reachable from `api/index.js`. Schema setup is
  lazy (`ensureSchema()` on the first request) so a slow or broken database can
  never stop the module from evaluating.
- No top-level driver imports. `pg`, `@neondatabase/serverless`, `ws` and
  `puppeteer` are dynamically imported on first use, so a missing binding or
  browser degrades to a 503 on the affected route instead of a bare 500 on all
  of them.

---

# API / VERCEL FUNCTIONS

## Overview
Express backend deployed as Vercel serverless functions. Two public functions
(`index.js`, `health.js`) plus one diagnostics function (`diag.js`); every other
module lives in `_lib/`.

## Structure
```
api/
├── index.js        # Vercel entry: imports _lib/app.js, exports the Express app
├── health.js       # Dependency-free health probe (never imports the app)
├── diag.js         # Import probe: reports which module/package fails to load
└── _lib/           # Everything else (NOT deployed as functions)
    ├── app.js          # Express routes + middleware
    ├── db.js           # Lazy Postgres/Neon pool + schema migrations + CRUD
    ├── generateDeck.js # LLM deck generation (streaming)
    ├── agentFive.js    # Agent Five chat/planning
    ├── exportPptx.js   # PPTX export (lazy Puppeteer)
    ├── exportPdf.js    # PDF export (lazy Puppeteer)
    ├── jobRunner.js    # Background generation jobs
    ├── streamParser.js # Incremental JSON parser for SSE
    ├── jsonRepair.js   # Tolerant JSON repair for LLM output
    ├── middleware/auth.js
    ├── routes/auth.js
    └── tools/browser.js
```

## Hard rules (learned the painful way)

1. **Nothing in `api/` except functions.** Vercel turns every supported file in
   `api/` into its own serverless function. The Hobby plan allows **12
   functions per deployment**; exceeding it fails the whole deploy with
   `exceeded_serverless_functions_per_deployment`. Shared code goes in
   `api/_lib/` (leading underscore = ignored by the function builder) or outside
   `api/` entirely.
2. **No top-level `await` and no module-scope side effects that can throw.**
   Module evaluation happens before any request; if it throws or hangs, every
   route returns a bare `FUNCTION_INVOCATION_FAILED` 500 with no stack trace.
   Schema setup therefore runs lazily via `ensureSchema()` on first request.
3. **Load heavy/optional dependencies lazily.** `pg`,
   `@neondatabase/serverless`, `ws` and `puppeteer` are all dynamic imports
   triggered on first use. A missing native binding or browser binary must
   degrade one route, never the whole function.
4. **Always answer with JSON from `/api`.** `app.js` ends with a catch-all 404
   and an error middleware, so failures surface as `{ error }` instead of
   Vercel's opaque HTML/plain-text error.
5. **Debug with `/api/diag`.** It imports every package and module in the graph
   individually and reports which one fails. Use `?db=1` to exercise the pool.

## Conventions
- Every protected route uses `authMiddleware`; DB-touching routes map
  `isDbError(err)` to 503 rather than 500.
- `dbRequired()` throws a 503-tagged error when no connection string is set, so
  the app runs (and the frontend degrades) without a database.
- Connection string resolution order: `POSTGRES_URL` → `SUPABASE_DATABASE_URL`
  → `DATABASE_URL`.
- `_lib/` mirrors the legacy `server/` directory; `api/` is what Vercel
  actually builds. Change `_lib/` first, then copy to `server/`.

## Environment
`POSTGRES_URL` (or `SUPABASE_DATABASE_URL` / `DATABASE_URL`), `JWT_SECRET`,
`LLM7_DECK_MODEL` / `LLM7_SLIDE_MODEL` / `LLM7_AGENT_MODEL` (optional),
`STATS_BASE_TOTAL` / `STATS_BASE_TODAY` (optional), `DIAG_KEY` (optional).