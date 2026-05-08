# Supabase migrations — canonical location

This directory (`supabase/migrations/` at the repo root) is the **canonical** location for new Supabase migrations going forward.

## Two directories — why?

Historical: the Supabase CLI workspace originally lived at `apps/web/supabase/` (and still does — its `config.toml` is there). When the platform expanded beyond web, we started creating new migrations at `supabase/migrations/` at the repo root for cross-surface visibility (e.g., desktop services, mobile dispatch, billing-layer-foundation).

Production has BOTH dirs' migrations applied — verified via `mcp__supabase__list_migrations` 2026-05-08. Deleting either directory locally would NOT remove the corresponding rows from `supabase.migrations`; it would only break local CLI workflows.

## Where to put new migrations

**Always put new migrations here**: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.

When the Supabase CLI runs (typically from `apps/web/`), it reads `apps/web/supabase/config.toml` for project linkage but each dev should also `cp` new migrations they author from `supabase/migrations/` to `apps/web/supabase/migrations/` until the consolidation completes (Step 1 below).

## Consolidation roadmap (low-risk path)

Status: **Step 0 done** (this README + `apps/web/supabase/README.md` document the split). Future steps:

1. **Step 1** — move `apps/web/supabase/config.toml` → `supabase/config.toml`. Update any `apps/web/package.json` script that runs `supabase` from `apps/web/`. Verify `supabase status` and `supabase db push` still target the same project.
2. **Step 2** — copy the 50 unique-to-legacy migrations from `apps/web/supabase/migrations/` into `supabase/migrations/` so `supabase/migrations/` has the full history. Production rows already match — the file move is purely a local-CLI alignment.
3. **Step 3** — remove `apps/web/supabase/` (delete or archive). Update CI / Vercel build hooks if any reference the old path.
4. **Step 4** — verify with `supabase db diff` against production — must show empty diff.

Each step is independently revertible. **Do NOT skip Step 1 to Step 3** — that breaks the CLI for anyone who hasn't already run Step 1.

## Cloud-provider portability

Per `docs/SCALING.md` and `packages/data-layer/`, the platform is being refactored so the database adapter (Supabase, Neon, raw Postgres, RDS, etc.) is swappable at config-time. The migrations themselves stay in this directory regardless of which provider runs the database — they are pure SQL DDL valid against any modern Postgres.

When migrating from Supabase to e.g. Neon:

1. Set `AGI_DATABASE_PROVIDER=neon` and `DATABASE_URL=postgresql://...neon...`.
2. Run `psql -f supabase/migrations/<latest>.sql` (or use `node-pg-migrate` / equivalent).
3. The application code changes are config-only because all DB access goes through `@agiworkforce/data-layer`.

## Audit & verification

- `mcp__supabase__list_migrations` lists currently-applied migrations on the live Supabase project (account `acct_1SgweG0zEfO6BZMh`).
- `mcp__supabase__get_advisors type=security` runs the advisor lints.
- `scripts/verify-surfaces.sh` does NOT touch the database; database verification is manual (`supabase db diff`) or via the MCP tools above.
