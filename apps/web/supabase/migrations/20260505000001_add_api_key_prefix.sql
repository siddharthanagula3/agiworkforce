-- Migration: 20260505000001_add_api_key_prefix.sql
-- Fix:       WEB-NEW-DOS-ARGON2 (red-team finding 2026-05) follow-on
-- Severity:  P0 — runtime breakage (column referenced by code but absent from schema)
--
-- ## Why this exists
--
-- `apps/web/lib/services/api-key-service.ts` was updated to a fast-path
-- O(1) verification flow that:
--
--   1. INSERTs into `api_keys` with a `key_prefix` column at line 218.
--   2. SELECTs `key_prefix` and filters `.eq('key_prefix', keyId)` at lines
--      304-306.
--   3. Falls back to `.is('key_prefix', null)` for legacy keys at line 354.
--
-- That code shipped without a migration — the `api_keys` table defined in
-- `20260101000000_consolidated_schema.sql` does NOT have a `key_prefix`
-- column. Every `createApiKey` call would error at insert time, and every
-- `verifyKey` call would error at the SELECT. The RT-02 fix is currently
-- non-functional.
--
-- This migration adds the column + a partial unique index so:
--   - new keys land with a unique 16-char `keyId` derived from their raw secret;
--   - legacy keys keep `key_prefix = NULL` and exercise the slow fallback path
--     (rate-limited at the caller per the file header);
--   - the partial unique index enforces no collisions on new-format keys
--     while permitting many NULLs for legacy rows.
--
-- Without the partial WHERE clause, a UNIQUE constraint would still permit
-- multiple NULL values in Postgres (NULLs are distinct by default), so the
-- partial form is semantically equivalent for now and self-documenting.
--
-- ## Verification (post-deploy)
--
--   -- New rows must have a non-null prefix; insert with NULL is allowed
--   -- (legacy compat) but should not happen via createApiKey().
--
--   -- Confirm the index is used:
--   EXPLAIN SELECT id FROM api_keys WHERE key_prefix = '0123456789abcdef';
--   -- Should show: Index Scan using idx_api_keys_key_prefix
--
--   -- Confirm the partial-unique constraint blocks duplicates:
--   INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
--     VALUES (..., '0123456789abcdef'); -- ok
--   INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
--     VALUES (..., '0123456789abcdef'); -- ERROR: duplicate key

BEGIN;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_prefix TEXT;

-- Partial unique index — fast lookups + collision-protect new keys, allow
-- many NULLs for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_prefix_unique
  ON public.api_keys (key_prefix)
  WHERE key_prefix IS NOT NULL;

COMMENT ON COLUMN public.api_keys.key_prefix IS
  'First 16 hex chars of the raw API key (the keyId segment of sk_live_<keyId>_<secret>). ' ||
  'Used for O(1) verification lookup so verifyKey runs at most one Argon2id ' ||
  'call per request instead of fanning out across every active key (DoS ' ||
  'amplification mitigated, see red-team finding 2026-05). NULL for legacy keys ' ||
  'minted before the prefix scheme; verifyKey falls back to a per-IP-rate-limited ' ||
  'scan for those.';

COMMIT;
