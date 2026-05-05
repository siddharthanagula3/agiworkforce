-- =============================================================================
-- RT-02 follow-up: api_keys.key_prefix column for fast verification lookup
-- Date: 2026-05-05
--
-- The RT-02 fix in apps/web/lib/services/api-key-service.ts (commit 2d6b4fa1)
-- introduced a new key format `sk_live_<keyId16hex>_<secret>` and changed
-- `verifyKey` to do a single-row DB lookup keyed on `key_prefix = keyId`.
-- The code change shipped without the corresponding column, so every
-- `createApiKey` call has been failing in production with PostgREST 42703
-- ("column 'key_prefix' does not exist").
--
-- This migration is FORWARD-ONLY:
--   * adds `key_prefix text NULL` so existing rows (legacy format) remain valid
--   * indexes `key_prefix` for the O(1) verifyKey fast path
--   * partial index excludes legacy NULL rows from the index
-- =============================================================================

ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS key_prefix text;

-- Partial index: legacy keys (key_prefix IS NULL) fall through to the slow scan
-- path which is rate-limited by callers. New keys are guaranteed unique by
-- their 16-hex random keyId so no UNIQUE constraint here — collisions are
-- detected at verify time via `.limit(2)`.
CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx
    ON public.api_keys (key_prefix)
    WHERE key_prefix IS NOT NULL;

COMMENT ON COLUMN public.api_keys.key_prefix IS
    'RT-02: 16-hex-char keyId from sk_live_<keyId>_<secret>. NULL for legacy keys.';
