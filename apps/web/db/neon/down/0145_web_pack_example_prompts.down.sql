-- Reversal of 0145 — drop the three new packs and the example_prompts column.
--
-- WHAT THIS COSTS: any user who installed engineering-pack, writing-pack, or
-- data-pack loses the row in plugin_registry_entries; plugin_installations
-- cascades the delete and the install disappears for them too.

begin;

delete from public.plugin_installations
 where plugin_id in ('engineering-pack', 'writing-pack', 'data-pack');

delete from public.plugin_registry_entries
 where id in ('engineering-pack', 'writing-pack', 'data-pack');

alter table public.plugin_registry_entries
  drop column if exists example_prompts;

delete from public.schema_migrations
 where filename = '0145_web_pack_example_prompts.sql';

commit;
