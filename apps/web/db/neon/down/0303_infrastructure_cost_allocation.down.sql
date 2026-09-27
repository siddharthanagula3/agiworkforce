begin;

delete from public.provider_cost_events
 where capability = any (array['hosting', 'auth', 'cache', 'observability'])
    or unit_basis = 'active_user_month';

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact', 'visual', 'decision'
  ]));

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_unit_basis_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_unit_basis_check check (unit_basis = any (array[
    'token', 'image', 'second', 'minute', 'request', 'gibibyte', 'gibibyte_month'
  ]));

drop table if exists public.infrastructure_vendor_bills;

delete from public.schema_migrations where filename = '0303_infrastructure_cost_allocation.sql';

commit;
