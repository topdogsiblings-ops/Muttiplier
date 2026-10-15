# Muttiplier

Script **Library** and shoot **Planner** for the topdogugc UGC agency. The full spec is in [docs/spec.md](docs/spec.md).

Nuxt 4 + Nuxt UI + Supabase (Postgres, Auth, RLS). Deployed on Vercel.

## Setup

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev
```

| Variable | Used for |
|---|---|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Publishable (or legacy anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Not needed today. Every server route runs as the signed-in user under RLS. |
| `ANTHROPIC_API_KEY` | AI drafting (optional). Without it the "Draft with AI" buttons return an error. |
| `ANTHROPIC_MODEL` | Model for AI drafting. Defaults to `claude-opus-5-5`. |

### Google sign-in (one-off, in the Supabase dashboard)

1. **Authentication → Sign In / Providers → Google**: enable it and paste the OAuth client ID and secret from Google Cloud. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI on the Google client.
2. **Authentication → URL Configuration**: set the Site URL to the production URL and add `http://localhost:3000/confirm` and `https://<your-domain>/confirm` to Redirect URLs.
3. Recommended: turn off the Email provider. Access is already restricted to Google sign-ins on the allowlist, so it is only attack surface.

Access is controlled by the `allowed_users` table (Settings → Allowlist). `joe@thesmilyfam.com` is seeded as admin.

### Deploying to Vercel

Import the repo, keep the Nuxt preset, and add the environment variables above. No other configuration is needed.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm test` | Unit tests for the slot, calculator and export modules |
| `npm run typecheck` | `vue-tsc` over the app, server and shared code |

## Layout

```
app/                 pages, components, composables (client)
server/api/          Nitro routes: shoot exports, AI drafting
shared/utils/        pure, unit-tested logic used by both sides
  slots.ts             {{slot}} parsing, rendering, validation
  calculator.ts        recipes / submissions / time estimates (spec §9)
  shootsheet.ts        codes, folder paths, shootsheet.json, CSV, zip skeleton
  loadShoot.ts         loads one shoot for the builder, shot sheet and exports
shared/types/        generated Supabase types
supabase/migrations/ schema, RLS policies and seed data
tests/               vitest
```

## Database changes

Add a SQL file to `supabase/migrations/`, apply it, then regenerate `shared/types/database.types.ts`
(`supabase gen types --lang=typescript --project-id <ref>`, or the Supabase MCP `generate_typescript_types` tool).

The names `clips`, `recipes`, `jobs`, `submissions` and `template_stats` are reserved for the later pipeline stages.

## How scripts are frozen

While a shoot is a **draft**, each item holds a copy of its template text and slots are filled live from the product and channel.
**Mark as planned** writes the filled text back into the item, so later edits to a template or product never change that shoot.
Codes are frozen at the same moment (enforced by a database trigger).

`{{dog}}` is filled from a hook's channel. An item that spans several channels (a VO, a CTA, or a hook in shared mode) has no single
dog phrase, so `{{dog}}` there shows as unfilled until it is overridden for that person.
