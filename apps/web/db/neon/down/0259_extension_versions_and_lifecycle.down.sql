-- Reversal of 0259 : drops extension version history and the admin lifecycle.
--
-- WHAT THIS COSTS: every release history, changelog and lifecycle reason is
-- deleted, and with them the last-known-good version rollback restores. The
-- record of which operator suspended which version, and why, goes too. An entry
-- an operator deprecated because its current version was suspended stays
-- deprecated, because nothing is left to say which version was the good one.

BEGIN;

DROP TABLE IF EXISTS public.plugin_registry_lifecycle_events;
DROP TABLE IF EXISTS public.plugin_registry_versions;

DROP INDEX IF EXISTS public.plugin_installations_pinned_version_idx;

ALTER TABLE public.user_connectors DROP COLUMN IF EXISTS version;
ALTER TABLE public.user_skills DROP COLUMN IF EXISTS version;
ALTER TABLE public.organization_mcp_servers DROP COLUMN IF EXISTS version;

DELETE FROM public.schema_migrations
 WHERE filename = '0259_extension_versions_and_lifecycle.sql';

COMMIT;
