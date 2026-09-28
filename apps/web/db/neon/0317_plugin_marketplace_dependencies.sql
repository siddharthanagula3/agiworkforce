-- =============================================================================
-- Migration 0326: plugin dependencies in registered marketplaces
--
-- Why    : installing a plugin installs the plugins it declares it depends on,
--          as Claude Code does (code.claude.com/docs/en/plugin-dependencies).
--          A marketplace a member registered keeps its plugins in
--          plugin_marketplace_entries, which had nowhere to keep what each
--          plugin depends on, and its source had nowhere to keep which other
--          marketplaces those dependencies may come from.
--
-- Shape  : dependencies holds an entry's declared dependencies as
--          {name, marketplace, version} objects; marketplace is null when the
--          dependency resolves in the entry's own marketplace, and version is
--          the declared range or null. allow_cross_marketplace_dependencies_on
--          holds the marketplace names the source's manifest lists in
--          allowCrossMarketplaceDependenciesOn. Both default to empty arrays,
--          so a source synced before this migration declares none until its
--          next refresh writes them.
--
-- Depends: 0159 (plugin_marketplace_sources, plugin_marketplace_entries)
-- =============================================================================

begin;

alter table public.plugin_marketplace_entries
  add column if not exists dependencies jsonb not null default '[]'::jsonb;

alter table public.plugin_marketplace_entries
  drop constraint if exists plugin_marketplace_entries_dependencies_shape,
  add constraint plugin_marketplace_entries_dependencies_shape
    check (jsonb_typeof(dependencies) = 'array');

alter table public.plugin_marketplace_sources
  add column if not exists allow_cross_marketplace_dependencies_on jsonb not null
    default '[]'::jsonb;

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_dependency_allowlist_shape,
  add constraint plugin_marketplace_sources_dependency_allowlist_shape
    check (jsonb_typeof(allow_cross_marketplace_dependencies_on) = 'array');

commit;
