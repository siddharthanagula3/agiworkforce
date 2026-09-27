-- Reversal of 0299 : removes dispute outcomes, plan-portion refunds and refund
-- requests.
--
-- WHAT THIS COSTS: every recorded dispute, with what its opening revoked and
-- whether a win restored it, is deleted, so a dispute still open when this runs
-- can no longer be restored when it is won; the credit postings it made stay in
-- credit_transactions. Every refund request, its assessment and the operator's
-- decision are deleted; the refunds themselves stay in Stripe. The webhook code
-- that calls these functions fails until 0299 is applied again, so revert that
-- code first.

begin;

drop function if exists public.revoke_plan_allowance_microusd(text, uuid, bigint, text);
drop function if exists public.restore_disputed_credits_microusd(text, text, uuid, bigint, bigint);
drop function if exists public.revoke_disputed_credits_microusd(text, text);

drop index if exists public.idx_credit_transactions_dispute_postings;

drop policy if exists billing_refund_requests_owner_file on public.billing_refund_requests;
drop policy if exists billing_refund_requests_owner_read on public.billing_refund_requests;
alter table public.billing_refund_requests no force row level security;
alter table public.billing_refund_requests disable row level security;
drop index if exists public.idx_billing_refund_requests_pending;
drop index if exists public.idx_billing_refund_requests_user;
drop index if exists public.idx_billing_refund_requests_one_per_charge;
alter table public.billing_refund_requests
  drop constraint if exists billing_refund_requests_refund_is_recorded;
alter table public.billing_refund_requests
  drop constraint if exists billing_refund_requests_decision_is_whole;
drop table if exists public.billing_refund_requests;

drop policy if exists billing_disputes_owner_read on public.billing_disputes;
alter table public.billing_disputes no force row level security;
alter table public.billing_disputes disable row level security;
drop index if exists public.idx_billing_disputes_open_customer;
drop index if exists public.idx_billing_disputes_user;
alter table public.billing_disputes
  drop constraint if exists billing_disputes_restoration_is_whole;
alter table public.billing_disputes
  drop constraint if exists billing_disputes_closed_when_decided;
alter table public.billing_disputes
  drop constraint if exists billing_disputes_top_up_within_revocation;
drop table if exists public.billing_disputes;

delete from public.schema_migrations
 where filename = '0299_billing_refunds_and_disputes.sql';

commit;
