-- Reversal of 0317 : registered marketplaces forget plugin dependencies.
--
-- WHAT THIS COSTS: every registered marketplace entry loses the dependencies
-- it declared, and every source loses its cross-marketplace allowlist.
-- Installed plugins stay installed, but installing a plugin from a registered
-- marketplace no longer installs the plugins it depends on until 0317 is
-- applied again and the source is refreshed.

begin;

alter table public.plugin_marketplace_entries
  drop constraint if exists plugin_marketplace_entries_dependencies_shape,
  drop column if exists dependencies;

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_dependency_allowlist_shape,
  drop column if exists allow_cross_marketplace_dependencies_on;

delete from public.schema_migrations
 where filename = '0317_plugin_marketplace_dependencies.sql';

commit;
