-- Reversal of 0221, back to the 0215 capability set.
--
-- The narrower constraint cannot hold rows on the two capabilities this
-- migration introduced, so they are deleted first. That loses the connector
-- and artifact accruals recorded while 0221 was in force; nothing else in the
-- ledger is touched, and no customer charge is derived from these rows.

begin;

delete from public.provider_cost_events
 where capability in ('connector', 'artifact');

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute'
  ]));

delete from public.schema_migrations
 where filename = '0221_connector_and_artifact_cost_capabilities.sql';

commit;
