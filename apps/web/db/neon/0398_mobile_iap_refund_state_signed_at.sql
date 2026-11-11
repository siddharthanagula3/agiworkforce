-- =============================================================================
-- Migration 0398: order mobile top-up refunds and reversals by their signed time
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Apple can deliver REFUND, REVOKE and REFUND_REVERSED for one top-up
--          receipt out of order. The notification service applied each in
--          arrival order, so a refund that arrived after its own reversal
--          revoked credits the customer had already been given back.
--
-- Shape  : One nullable timestamp on mobile_iap_transactions holding the
--          signed time of the newest refund-state notice applied to that
--          receipt. A notice signed earlier than the stored value is ignored.
--          Null means no refund-state notice has been applied.
--
-- Empty  : existing receipts keep null and are ordered from their next notice.
--
-- Depends: 0112 (mobile native in-app purchases)
-- =============================================================================

begin;

alter table public.mobile_iap_transactions
  add column if not exists refund_state_signed_at timestamptz;

comment on column public.mobile_iap_transactions.refund_state_signed_at is
  'Signed time of the newest refund, revoke or refund-reversal notice applied to this receipt. Null means none has been applied.';

commit;
