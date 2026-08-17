-- 0129 — give every cost event the task it belongs to and how that task ended.
--
-- 0127 recorded what managed cloud spends, but every row was the same shape of
-- fact: money left the building. Nothing recorded whether the work that money
-- bought was delivered, whether the user immediately asked for the same thing
-- again, or whether the client never confirmed receiving it. Cost per delivered
-- task, repeat (retry) cost and the cost of work the user may never have seen
-- were all unanswerable, so the only margin question the ledger could answer
-- was the gross one.
--
-- task_ref is the managed-usage request fingerprint: the same prompt and
-- parameters hash to the same value, so a regenerated turn lands on the same
-- task and its extra spend is separable from the first attempt's.
--
-- task_outcome is the settled request status, not an inference: 'delivered' is
-- a completed settlement, 'undelivered' is the outcome_unknown settlement where
-- the provider was paid but the client never confirmed delivery.

begin;

alter table public.provider_cost_events
  add column if not exists task_ref text;

alter table public.provider_cost_events
  add column if not exists task_outcome text not null default 'delivered';

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_task_outcome_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_task_outcome_check
  check (task_outcome = any (array['delivered', 'undelivered']));

create index if not exists idx_provider_cost_events_task_ref
  on public.provider_cost_events (task_ref, occurred_at);

create index if not exists idx_provider_cost_events_task_outcome
  on public.provider_cost_events (task_outcome, occurred_at desc);

create or replace function public.task_economics(p_start timestamptz, p_end timestamptz)
returns table(
  delivered_tasks bigint,
  delivered_task_cost_cents bigint,
  repeated_tasks bigint,
  repeat_cost_cents bigint,
  undelivered_events bigint,
  undelivered_cost_cents bigint,
  unattributed_cost_cents bigint
)
language sql
stable
as $$
  with window_events as (
    select event.task_ref,
           event.task_outcome,
           event.provider_cost_cents,
           row_number() over (
             partition by event.task_ref
                 order by event.occurred_at, event.id
           ) as attempt
      from public.provider_cost_events event
     where event.occurred_at >= p_start
       and event.occurred_at < p_end
       and event.task_ref is not null
  ), delivered as (
    select * from window_events where task_outcome = 'delivered'
  )
  select
    (select count(*) from delivered where attempt = 1)::bigint,
    (select coalesce(sum(provider_cost_cents), 0) from delivered where attempt = 1)::bigint,
    (select count(distinct task_ref) from delivered where attempt > 1)::bigint,
    (select coalesce(sum(provider_cost_cents), 0) from delivered where attempt > 1)::bigint,
    (select count(*) from window_events where task_outcome = 'undelivered')::bigint,
    (select coalesce(sum(provider_cost_cents), 0)
       from window_events where task_outcome = 'undelivered')::bigint,
    (select coalesce(sum(event.provider_cost_cents), 0)
       from public.provider_cost_events event
      where event.occurred_at >= p_start
        and event.occurred_at < p_end
        and event.task_ref is null)::bigint;
$$;

comment on column public.provider_cost_events.task_ref is
  'The managed-usage request fingerprint. Repeats of the same task share it, so first-attempt cost and repeat cost separate.';

comment on column public.provider_cost_events.task_outcome is
  'How the settlement that produced this cost ended: delivered, or undelivered when the client never confirmed receipt.';

comment on function public.task_economics(timestamptz, timestamptz) is
  'Quality-adjusted cost: first-attempt cost per delivered task, repeat cost, and the cost of work the user may never have received.';

commit;
