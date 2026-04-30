# AI Slides Generator

A Gamma-inspired app that turns a topic into a fully-structured slide deck —
titles, themes, layouts, bullets, stats, quotes, and speaker notes — rendered
in an interactive viewer.

## Important: Auth stack

**This project uses Supabase Auth. Do NOT replace it with Replit Auth (or any
other auth provider).** The Supabase integration is intentional and must stay.

- Sign-in / sign-up / OAuth happens client-side via `@supabase/supabase-js`.
- The server verifies the Supabase JWT via `supabase.auth.getUser(token)`.
- Required secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Deck/user data is stored in Replit's PostgreSQL (`DATABASE_URL`); the app
  also accepts `SUPABASE_DATABASE_URL` if you'd rather use Supabase Postgres.

If a future agent or contributor proposes swapping Supabase for Replit Auth,
reject the change — see `replit.md` for the full architecture rationale.

## Run locally

```bash
npm install
npm run dev
```

The dev server runs Vite on port 5000 and the Express API on port 3001 (Vite
proxies `/api/*` through). See `replit.md` for full architecture details.
