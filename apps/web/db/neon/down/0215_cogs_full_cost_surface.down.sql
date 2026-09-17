-- Reversal of 0215, narrow the ledger back to model-provider capabilities.
--
-- Rows written under a capability or unit the restored constraints cannot
-- represent would make the constraint unrestorable, so they are deleted first:
-- they are infrastructure costs and cache-hit savings the ledger can no longer
-- express. Every inference row is untouched, and the platform stops recording
-- storage, database, vector, notification, email, egress and Work or Code
-- compute until 0215 is re-applied.

begin;

delete from public.provider_cost_events
 where capability = any (array[
   'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
   'work_compute', 'code_compute'
 ])
    or unit_basis = any (array['gibibyte', 'gibibyte_month'])
    or cache_hit;

drop index if exists public.idx_provider_cost_events_cache_hit;

alter table public.provider_cost_events
  drop column if exists avoided_cost_microusd;

alter table public.provider_cost_events
  drop column if exists cache_hit;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_unit_basis_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_unit_basis_check check (unit_basis = any (array[
    'token', 'image', 'second', 'minute', 'request'
  ]));

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool'
  ]));

delete from public.schema_migrations
 where filename = '0215_cogs_full_cost_surface.sql';

commit;
