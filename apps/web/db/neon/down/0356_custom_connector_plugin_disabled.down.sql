-- Reversal of 0356 : a disabled plugin no longer takes its connectors out of use.
--
-- WHAT THIS COSTS: connectors of a plugin that is currently turned off become
-- usable again, because the marker that kept them out of use is dropped.

begin;

alter table public.user_custom_connectors drop column if exists disabled_by_plugin_at;

delete from public.schema_migrations
 where filename = '0356_custom_connector_plugin_disabled.sql';

commit;
