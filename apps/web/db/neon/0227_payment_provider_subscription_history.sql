-- 0227 : the state a subscription was in, every time a payment provider moved it.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- public.subscriptions holds one row per subscription and is overwritten on
-- every provider event, so the only answer to "when did this workspace go past
-- due, and what was it before" came from credit_transactions and the audit
-- trail, neither of which records subscription state. A billing dispute, a
-- credit re-grant, or a collection stage that looks wrong all need the prior
-- state, and no table held it.
--
-- One row per observed change, appended by the PaymentProvider layer
-- (apps/web/lib/server/payments) from a NormalizedSubscription, so Stripe,
-- Apple and Google land in the same units: a normalized status, a period in
-- timestamptz whatever the provider sent, and an integer quantity.
--
-- provider_event_id is the provider's own event identifier where it has one.
-- The partial unique index on it makes a replayed webhook a no-op rather than a
-- second row claiming a second transition.
--
-- Append-only: app_rls is granted select alone, and an org admin reads only
-- their own workspace's rows.

begin;

create table if not exists public.organization_subscription_state_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_provider text not null
    check (payment_provider = any (array['stripe', 'apple', 'google'])),
  subscription_reference text not null check (char_length(subscription_reference) between 1 and 255),
  previous_status text,
  status text not null
    check (status = any (array['active', 'trialing', 'past_due', 'canceled', 'incomplete',
                               'incomplete_expired', 'unpaid', 'none'])),
  quantity integer not null default 1 check (quantity >= 1),
  cancel_at_period_end boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,
  provider_event_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_org_subscription_transitions_org_occurred
  on public.organization_subscription_state_transitions (organization_id, occurred_at desc);

create index if not exists idx_org_subscription_transitions_reference
  on public.organization_subscription_state_transitions
     (payment_provider, subscription_reference, occurred_at desc);

create unique index if not exists idx_org_subscription_transitions_event
  on public.organization_subscription_state_transitions
     (payment_provider, subscription_reference, provider_event_id)
  where provider_event_id is not null;

alter table public.organization_subscription_state_transitions enable row level security;
alter table public.organization_subscription_state_transitions force row level security;

drop policy if exists organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions;
create policy organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

grant select on public.organization_subscription_state_transitions to app_rls;

commit;
