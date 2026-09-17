-- 0215 : account for every cost the platform carries, not only inference.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- provider_cost_events enumerated the capabilities bought from a model
-- provider. Everything else the platform pays for was absent from the ledger
-- entirely: bytes at rest, database compute, vector queries, delivered
-- notifications and emails, network egress, and the compute behind a Work or
-- Code run. A margin question asked of this table therefore answered with the
-- inference bill and called it the cost of goods.
--
-- The new capabilities are metered in units this table could not express, so
-- unit_basis gains 'gibibyte' and 'gibibyte_month'. None of them carries a
-- price in this repository: each is rate-carded as deployment_metered, which
-- means an unpriced row still records what was consumed and becomes priced the
-- moment the deployment sets that row's override.
--
-- cache_hit and avoided_cost_microusd are the accounting line for a turn a
-- cache answered. Without them a saved call is simply a row that does not
-- exist, and a saving that cannot be summed cannot be reported. A cache-hit
-- row costs zero and bills zero; what it carries is the list price of the call
-- that did not happen.

begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute'
  ]));

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_unit_basis_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_unit_basis_check check (unit_basis = any (array[
    'token', 'image', 'second', 'minute', 'request', 'gibibyte', 'gibibyte_month'
  ]));

alter table public.provider_cost_events
  add column if not exists cache_hit boolean not null default false;

alter table public.provider_cost_events
  add column if not exists avoided_cost_microusd bigint
    check (avoided_cost_microusd is null or avoided_cost_microusd >= 0);

create index if not exists idx_provider_cost_events_cache_hit
  on public.provider_cost_events (occurred_at desc)
  where cache_hit;

comment on column public.provider_cost_events.cache_hit is
  'True when a cache answered the operation and no provider call was made. The row costs and bills zero.';

comment on column public.provider_cost_events.avoided_cost_microusd is
  'List price of the provider call a cache hit replaced, so the saving is a summed column rather than an inference from missing rows.';

commit;
