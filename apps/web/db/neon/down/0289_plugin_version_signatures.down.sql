-- Reversal of the plugin version signature columns.
--
-- WHAT THIS COSTS: the signature recorded against each published artifact is
-- deleted. The entry keeps the pair it currently publishes, so nothing stops
-- being installable, but the update path loses the per-version signed digest it
-- verifies and falls back to whatever the entry happens to carry.

BEGIN;

ALTER TABLE public.plugin_registry_versions
  DROP CONSTRAINT IF EXISTS plugin_registry_versions_signature_covers_a_digest;
ALTER TABLE public.plugin_registry_versions
  DROP CONSTRAINT IF EXISTS plugin_registry_versions_signature_pairs_with_algorithm;

ALTER TABLE public.plugin_registry_versions
  DROP COLUMN IF EXISTS signature_algorithm;
ALTER TABLE public.plugin_registry_versions
  DROP COLUMN IF EXISTS signature;

DELETE FROM public.schema_migrations
 WHERE filename = '0289_plugin_version_signatures.sql';

COMMIT;
