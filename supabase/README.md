# Supabase migrations — canonical location

This directory (`supabase/migrations/` at the repo root) is the **canonical** location for new Supabase migrations going forward.

## Two directories — why?

Historical: the Supabase CLI workspace originally lived at `apps/web/supabase/` (and still does — its `config.toml` is there). When the platform expanded beyond web, we started creating new migrations at `supabase/migrations/` at the repo root for cross-surface visibility (e.g., desktop services, mobile dispatch, billing-layer-foundation).

Production has BOTH dirs' migrations applied — verified via `mcp__supabase__list_migrations` 2026-05-08. Deleting either directory locally would NOT remove the corresponding rows from `supabase.migrations`; it would only break local CLI workflows.

## Where to put new migrations

**Always put new migrations here**: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.

When the Supabase CLI runs (typically from `apps/web/`), it reads `apps/web/supabase/config.toml` for project linkage. New schema work still goes only in root `supabase/migrations/`; do not mirror or copy new migrations into the legacy Web directory.

## Frozen legacy directory

`apps/web/supabase/migrations/` is a frozen historical directory. Do not add new SQL files under `apps/web/supabase/migrations/`. `pnpm check:supabase-migrations` enforces the current legacy allowlist so paid-tier/schema work cannot accidentally revive the split source of truth.

## Consolidation roadmap (low-risk path)

Status: **Step 0 done** (this README + `apps/web/supabase/README.md` document the split). Future steps:

1. **Step 1** — move `apps/web/supabase/config.toml` → `supabase/config.toml`. Update any `apps/web/package.json` script that runs `supabase` from `apps/web/`. Verify `supabase status` and `supabase db push` still target the same project.
2. **Step 2** — reconcile the 50 frozen legacy migrations from `apps/web/supabase/migrations/` into the root canonical history after a production diff. Production rows already match; the file move is a local-CLI alignment, but timestamp-collision notes in `20260509000005_canonical_dir_history_marker.sql` must be respected.
3. **Step 3** — remove `apps/web/supabase/` (delete or archive). Update CI / Vercel build hooks if any reference the old path.
4. **Step 4** — verify with `supabase db diff` against production — must show empty diff.

Each step is independently revertible. **Do NOT skip Step 1 to Step 3** — that breaks the CLI for anyone who hasn't already run Step 1.

## Cloud-provider portability

Per `docs/current/technical-architecture.md` and `packages/data-layer/`, the platform is being refactored so the database adapter (Supabase, Neon, raw Postgres, RDS, etc.) is swappable at config-time. The migrations themselves stay in this directory regardless of which provider runs the database — they are pure SQL DDL valid against any modern Postgres.

When migrating from Supabase to e.g. Neon:

1. Set `AGI_DATABASE_PROVIDER=neon` and `DATABASE_URL=postgresql://...neon...`.
2. Run `psql -f supabase/migrations/<latest>.sql` (or use `node-pg-migrate` / equivalent).
3. The application code changes are config-only because all DB access goes through `@agiworkforce/data-layer`.

## Audit & verification

- `mcp__supabase__list_migrations` lists currently-applied migrations on the live Supabase project (account `acct_1SgweG0zEfO6BZMh`).
- `mcp__supabase__get_advisors type=security` runs the advisor lints.
- `scripts/verify-surfaces.sh` does NOT touch the database; database verification is manual (`supabase db diff`) or via the MCP tools above.
