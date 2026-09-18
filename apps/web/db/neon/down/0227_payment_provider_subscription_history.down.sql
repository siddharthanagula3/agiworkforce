-- Reversal of 0227, drop the subscription state history.
--
-- Every recorded transition is discarded with the table. The current state of
-- each subscription is unaffected: it lives in public.subscriptions and in the
-- provider, and this table only ever recorded what that state used to be.

begin;

drop policy if exists organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions;

alter table public.organization_subscription_state_transitions disable row level security;
alter table public.organization_subscription_state_transitions no force row level security;

drop index if exists public.idx_org_subscription_transitions_event;
drop index if exists public.idx_org_subscription_transitions_reference;
drop index if exists public.idx_org_subscription_transitions_org_occurred;

drop table if exists public.organization_subscription_state_transitions;

delete from public.schema_migrations
 where filename = '0227_payment_provider_subscription_history.sql';

commit;
