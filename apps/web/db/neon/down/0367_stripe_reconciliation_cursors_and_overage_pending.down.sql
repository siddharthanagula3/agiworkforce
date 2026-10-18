-- Reversal of 0367 forgets which subscriptions each reconciliation has
-- examined, so both start again from the oldest updated_at. The reported
-- overage cumulative is written back to metadata.enterpriseUsageReporting,
-- where the previous release reads it. A pending overage report is lost: if
-- its meter event reached Stripe it stays billed, and if not, the previous
-- release reports the same overage again on its next run.

begin;

update public.organization_billing_contracts
   set metadata = metadata || jsonb_build_object(
         'enterpriseUsageReporting',
         jsonb_build_object(
           'period', overage_reported_period,
           'cumulativeOverageReportedCents', overage_reported_cents
         )
       )
 where overage_reported_period is not null;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_pending_positive,
  drop constraint if exists organization_billing_contracts_overage_pending_complete,
  drop constraint if exists organization_billing_contracts_overage_reported_nonnegative,
  drop column if exists overage_pending_at,
  drop column if exists overage_pending_identifier,
  drop column if exists overage_pending_cumulative_cents,
  drop column if exists overage_pending_cents,
  drop column if exists overage_pending_period,
  drop column if exists overage_reported_cents,
  drop column if exists overage_reported_period;

drop index if exists public.idx_subscriptions_stripe_price_reconciled;
drop index if exists public.idx_subscriptions_stripe_state_reconciled;

alter table public.subscriptions
  drop column if exists stripe_price_reconciled_at,
  drop column if exists stripe_state_reconciled_at;

delete from public.schema_migrations
 where filename = '0367_stripe_reconciliation_cursors_and_overage_pending.sql';

commit;
