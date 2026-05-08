# `apps/web/supabase/` — Supabase CLI workspace

This directory is currently the active **Supabase CLI workspace** (it has the `config.toml` that links to the production project). Until consolidation completes, the CLI commands (`supabase status`, `supabase db push`, `supabase migration list`, etc.) must be run from inside `apps/web/`.

## Canonical migrations live one level up

New migrations should be authored at `supabase/migrations/` (repo root), not here. See [`supabase/README.md`](../../supabase/README.md) for the rationale and consolidation roadmap.

While the consolidation is in flight, `supabase/migrations/` (root) has the newer cross-surface migrations and `apps/web/supabase/migrations/` (this dir) has older migrations that are also applied in production. Both dirs together form the complete production history.

## Why not just delete this directory now?

Production already has every migration applied. Deleting this directory locally would:

- Break `supabase` CLI commands run from `apps/web/` (no `config.toml`).
- Make new contributors confused about which dir is the source of truth.
- Possibly desync the local `supabase migration list` output from the production state.

The roadmap in `supabase/README.md` resolves this safely in 4 reversible steps.
