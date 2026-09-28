-- Reversal of 0332 : connectors no longer remember which plugin added them.
--
-- WHAT THIS COSTS: the connectors plugins added stay as ordinary custom
-- connectors, and removing a plugin no longer removes its servers.

begin;

drop index if exists public.idx_user_custom_connectors_plugin;
alter table public.user_custom_connectors drop column if exists installed_by_plugin;

delete from public.schema_migrations
 where filename = '0332_custom_connector_plugin_source.sql';

commit;
