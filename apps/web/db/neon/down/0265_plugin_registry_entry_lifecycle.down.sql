-- Reversal of 0265 : narrows the registry entry lifecycle back to three values.
--
-- WHAT THIS COSTS: any entry sitting at 'draft', 'in_review' or 'suspended'
-- fails the narrowed check and the ALTER aborts. Move those rows to 'preview'
-- or 'deprecated' first, and accept that doing so destroys the distinction
-- between "withdrawn for safety" and "superseded".

begin;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_status_check;

alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_status_check
  check (status in ('preview', 'published', 'deprecated'));

delete from public.schema_migrations
 where filename = '0265_plugin_registry_entry_lifecycle.sql';

commit;
