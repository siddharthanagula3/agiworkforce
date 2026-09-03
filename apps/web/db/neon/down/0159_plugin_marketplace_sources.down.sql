-- Reversal of 0159 — drop the plugin marketplace tables.

BEGIN;

drop table if exists public.plugin_marketplace_installations;
drop table if exists public.plugin_marketplace_entries;
drop table if exists public.plugin_marketplace_sources;

delete from public.schema_migrations
 where filename = '0159_plugin_marketplace_sources.sql';

COMMIT;
