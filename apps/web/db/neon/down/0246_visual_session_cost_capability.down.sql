-- Reversal of 0246, back to the 0221 capability set.
--
-- The narrower constraint cannot hold rows on the capability this migration
-- introduced, so they are deleted first. That loses the camera and screen-share
-- minutes recorded while 0246 was in force; nothing else in the ledger is
-- touched, and both features are deployment_metered, so no customer charge is
-- derived from these rows.

begin;

delete from public.provider_cost_events
 where capability = 'visual';

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact'
  ]));

delete from public.schema_migrations
 where filename = '0246_visual_session_cost_capability.sql';

commit;
