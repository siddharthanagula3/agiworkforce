-- =============================================================================
-- api_keys table — RECONSTRUCTED from prod state
-- Date authored: 2026-05-09 (Wave 5.9)
-- Prod-applied date: 2026-05-06 23:20:38 UTC (per supabase_migrations.schema_migrations)
-- Prod migration version: 20260506232038
-- Prod migration name: create_api_keys_with_prefix
-- =============================================================================
--
-- == How this file was produced ==
--
-- Wave 5.4 (`tasks/research/exec/w54-timestamp-reconcile-report.md` §9.3)
-- discovered that prod's `schema_migrations` ledger contains version
-- `20260506232038 create_api_keys_with_prefix` but NEITHER `supabase/migrations/`
-- nor `apps/web/supabase/migrations/` carried a matching file. The migration
-- had been applied via a hand-crafted MCP `apply_migration` call during the
-- May 6 sprint without being saved to the canonical dir — a process gap
-- that risks future drift if the canonical dir is treated as authoritative.
--
-- This file reconstructs the SQL by introspecting prod state on 2026-05-09
-- via `mcp__supabase__execute_sql`:
--
--   * information_schema.columns       — column list, types, nullability, defaults
--   * pg_indexes                       — index definitions
--   * information_schema.table_constraints
--                                      — PK + FK + check constraints
--   * pg_policies                      — RLS policies
--   * information_schema.triggers      — triggers (none on this table)
--
-- The file is written under its ORIGINAL prod version (20260506232038) so a
-- fresh `supabase db push` against a NEW project (e.g. a clone for staging)
-- will land the same schema in the same migration order. For prod itself,
-- the version is already applied, so push is a no-op via `supabase migration
-- list`'s "synced" check.
--
-- == What this migration does ==
--
-- Creates `public.api_keys` for the BYOK developer-facing API key feature
-- referenced from `apps/web/lib/services/api-key-service.ts`. The table holds
-- one row per API key with:
--   - `key_hash`: Argon2id hash of the raw secret (never the secret itself)
--   - `key_prefix`: 16-hex-char keyId derived from the secret. Used for the
--     O(1) verifyKey fast path that landed in the same wave (RT-02 follow-up
--     to WEB-NEW-DOS-ARGON2 — see `apps/web/lib/services/api-key-service.ts`
--     comment block).
--   - `scopes`: text[] permission scopes for the key
--   - `last_used_at`, `expires_at`: lifecycle metadata
--
-- Identical behaviour to the legacy `apps/web/supabase/migrations/20260505000001_add_api_key_prefix.sql`
-- which is what was actually applied (just under the earlier prod version).
-- The canonical `supabase/migrations/20260505000001_api_keys_key_prefix.sql`
-- is a partial duplicate with a non-unique index variant; that file is
-- preserved on disk for documentation but `migration repair`d to "applied"
-- per Wave 5.4's runbook so it does NOT execute.
-- =============================================================================

BEGIN;

-- Note: uuid_generate_v4() and gen_random_uuid() are both available in prod
-- (extensions pgcrypto + uuid-ossp confirmed at the `extensions` schema).
-- Prod uses uuid_generate_v4() for the id column default; we keep that
-- exact default to match prod's reconstructed shape byte-for-byte.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id            uuid        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id       uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    key_hash      text        NOT NULL,
    scopes        text[]      DEFAULT '{}'::text[],
    last_used_at  timestamptz,
    expires_at    timestamptz,
    created_at    timestamptz DEFAULT timezone('utc'::text, now()),
    key_prefix    text
);

-- Indexes (other than the implicit PK):
--   * Per-user lookups
--   * Partial UNIQUE on key_prefix for the O(1) verifyKey fast path (see
--     RT-02 commentary in api-key-service.ts). Legacy keys with key_prefix
--     IS NULL are excluded from the index — they fall through to a slow
--     scan that's rate-limited by callers.
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
    ON public.api_keys (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_prefix_unique
    ON public.api_keys (key_prefix)
    WHERE key_prefix IS NOT NULL;

-- RLS: matches prod's two policies on this table.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages api keys"
    ON public.api_keys FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Note: the prod policy below is TO public, not TO authenticated. This is
-- intentionally reproduced here to match the reconstructed prod state. A
-- future hardening pass should consider tightening to TO authenticated;
-- doing so via this reconstruction would change the prod-applied semantics.
CREATE POLICY "Users can manage own api keys"
    ON public.api_keys FOR ALL
    TO public
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.api_keys IS
    'BYOK developer-facing API keys. key_hash = Argon2id, key_prefix = 16-hex ' ||
    'keyId for O(1) verify lookup. RECONSTRUCTED 2026-05-09 from prod state ' ||
    'after the original ad-hoc apply_migration call did not write to the ' ||
    'canonical migrations dir. See tasks/research/exec/w59-hardening-report.md.';

COMMENT ON COLUMN public.api_keys.key_prefix IS
    'First 16 hex chars of the raw API key. Used for O(1) verifyKey lookup. ' ||
    'NULL for legacy keys minted before the prefix scheme.';

COMMIT;
