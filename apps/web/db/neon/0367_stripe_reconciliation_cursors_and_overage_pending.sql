-- =============================================================================
-- Migration 0367: Stripe reconciliation cursors and a pending overage report
--
-- Why    : the daily subscription-state and billed-plan reconciliations each
--          read the 100 subscriptions with the oldest updated_at. A row that
--          already agrees with Stripe is not written, so its updated_at never
--          moves and the same 100 rows were read every day while every other
--          subscription went unchecked.
--
--          Enterprise overage was reported to Stripe as a meter event first
--          and recorded as reported after. When the record failed, the next
--          run computed the same overage again under a new day's identifier,
--          and Stripe billed it twice. The reported cumulative also lived in
--          the contract's free-form metadata.
--
-- Shape  : subscriptions gains one cursor per reconciliation, stamped on every
--          row a run examined. Each run reads the rows never examined first,
--          then the least recently examined, so the whole table is covered
--          batch by batch. Each job has its own cursor so neither consumes the
--          rows the other has yet to read.
--
--          organization_billing_contracts gains the reported cumulative for
--          the current period and a pending report. The pending report, with
--          the meter-event identifier it will be sent under, is written before
--          Stripe is called and cleared only after it succeeds, so a retry
--          resends the same identifier and value instead of a new charge. The
--          reported cumulative is copied from metadata.enterpriseUsageReporting.
--
-- Access : no policy or grant changes; both tables keep their existing RLS.
--
-- Depends: 0003 (subscriptions), 0163 (organization_billing_contracts)
-- =============================================================================

begin;

alter table public.subscriptions
  add column if not exists stripe_state_reconciled_at timestamptz,
  add column if not exists stripe_price_reconciled_at timestamptz;

create index if not exists idx_subscriptions_stripe_state_reconciled
  on public.subscriptions (stripe_state_reconciled_at asc nulls first)
  where stripe_subscription_id is not null and stripe_subscription_id <> '';

create index if not exists idx_subscriptions_stripe_price_reconciled
  on public.subscriptions (stripe_price_reconciled_at asc nulls first)
  where stripe_subscription_id is not null and stripe_subscription_id <> '';

alter table public.organization_billing_contracts
  add column if not exists overage_reported_period text,
  add column if not exists overage_reported_cents bigint not null default 0,
  add column if not exists overage_pending_period text,
  add column if not exists overage_pending_cents bigint,
  add column if not exists overage_pending_cumulative_cents bigint,
  add column if not exists overage_pending_identifier text,
  add column if not exists overage_pending_at timestamptz,
  add constraint organization_billing_contracts_overage_reported_nonnegative
    check (overage_reported_cents >= 0),
  add constraint organization_billing_contracts_overage_pending_complete
    check (
      (overage_pending_identifier is null) = (overage_pending_period is null)
      and (overage_pending_identifier is null) = (overage_pending_cents is null)
      and (overage_pending_identifier is null) = (overage_pending_cumulative_cents is null)
      and (overage_pending_identifier is null) = (overage_pending_at is null)
    ),
  add constraint organization_billing_contracts_overage_pending_positive
    check (overage_pending_cents is null or overage_pending_cents > 0);

update public.organization_billing_contracts
   set overage_reported_period = metadata -> 'enterpriseUsageReporting' ->> 'period',
       overage_reported_cents = greatest(
         0,
         round((metadata -> 'enterpriseUsageReporting' ->> 'cumulativeOverageReportedCents')::numeric)
       )::bigint
 where jsonb_typeof(metadata -> 'enterpriseUsageReporting' -> 'period') = 'string'
   and jsonb_typeof(metadata -> 'enterpriseUsageReporting' -> 'cumulativeOverageReportedCents') = 'number';

comment on column public.subscriptions.stripe_state_reconciled_at is
  'When the daily reconciliation last compared this row''s status and period with Stripe. Null rows are compared first.';
comment on column public.subscriptions.stripe_price_reconciled_at is
  'When the daily billed-plan reconciliation last compared this row''s plan and price with Stripe. Null rows are compared first.';
comment on column public.organization_billing_contracts.overage_pending_identifier is
  'The meter-event identifier of an overage report written before Stripe was called and not yet confirmed. A retry resends it unchanged.';

commit;
