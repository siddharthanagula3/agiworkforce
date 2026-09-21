-- =============================================================================
-- Plugin version signatures
--
-- Why    : the per-version history carries `sha256` but no signature, while the
--          entry carries `sha256`, `signature` and `signature_algorithm`
--          together. Repointing the entry at another version therefore wrote a
--          new digest over the previous version's signature, leaving the entry
--          claiming an artifact nobody signed, and left the update path with no
--          signed digest of its own to verify at all.
--
-- What   : the version history gains the other two thirds of the integrity
--          triple, so one row describes one artifact end to end and the entry
--          is written from that row rather than partially updated.
--
-- Backfill: the version an entry currently points at inherits the entry's
--          signature, because that pair is what the entry already published.
--          Every other historical row keeps a null signature, which is the
--          honest answer: no signature for that artifact was ever recorded.
--
-- Depends: plugin_registry_entries and plugin_registry_versions.
-- =============================================================================

BEGIN;

ALTER TABLE public.plugin_registry_versions
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS signature_algorithm text;

ALTER TABLE public.plugin_registry_versions
  DROP CONSTRAINT IF EXISTS plugin_registry_versions_signature_pairs_with_algorithm;
ALTER TABLE public.plugin_registry_versions
  ADD CONSTRAINT plugin_registry_versions_signature_pairs_with_algorithm CHECK (
    (signature IS NULL AND signature_algorithm IS NULL)
    OR (signature IS NOT NULL AND signature_algorithm IN ('ed25519'))
  );

ALTER TABLE public.plugin_registry_versions
  DROP CONSTRAINT IF EXISTS plugin_registry_versions_signature_covers_a_digest;
ALTER TABLE public.plugin_registry_versions
  ADD CONSTRAINT plugin_registry_versions_signature_covers_a_digest CHECK (
    signature IS NULL OR sha256 IS NOT NULL
  );

COMMENT ON COLUMN public.plugin_registry_versions.signature IS
  'Publisher signature over this version''s own digest. NULL means no signature for this artifact was ever recorded, never that one is unnecessary.';
COMMENT ON COLUMN public.plugin_registry_versions.signature_algorithm IS
  'Algorithm the signature column was produced with.';

UPDATE public.plugin_registry_versions versions
   SET signature = entries.signature,
       signature_algorithm = entries.signature_algorithm
  FROM public.plugin_registry_entries entries
 WHERE entries.id = versions.plugin_id
   AND entries.version = versions.version
   AND entries.signature IS NOT NULL
   AND versions.signature IS NULL
   AND versions.sha256 IS NOT NULL
   AND versions.sha256 = entries.sha256;

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No signature without the digest it covers:
-- --    SELECT count(*) FROM public.plugin_registry_versions
-- --     WHERE signature IS NOT NULL AND sha256 IS NULL;   -- EXPECT: 0
--
-- -- 2. The version each entry points at agrees with the entry:
-- --    SELECT count(*) FROM public.plugin_registry_entries e
-- --      JOIN public.plugin_registry_versions v
-- --        ON v.plugin_id = e.id AND v.version = e.version
-- --     WHERE e.signature IS NOT NULL AND v.signature IS DISTINCT FROM e.signature;
-- --                                                       -- EXPECT: 0
--
-- -- 3. An unpaired algorithm is impossible:
-- --    UPDATE public.plugin_registry_versions SET signature_algorithm = 'rsa';
-- --                                                       -- EXPECT: check violation
-- =============================================================================
