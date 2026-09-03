-- Reversal of 0161 — remove the presentations role bundle.

BEGIN;

delete from public.plugin_installations where plugin_id = 'presentations-pack';
delete from public.plugin_registry_entries where id = 'presentations-pack';

delete from public.schema_migrations
 where filename = '0161_presentations_pack.sql';

COMMIT;
