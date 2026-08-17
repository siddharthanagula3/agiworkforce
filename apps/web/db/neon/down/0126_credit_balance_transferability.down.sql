-- Reversal of 0126 — drop the non-transferability guards on the credit ledger.
--
-- WHAT THIS COSTS: after this runs, an UPDATE can move a credit account or a
-- ledger entry to another user_id with nothing objecting. The balance would then
-- sit under an identity that cannot be refunded for it and whose dispute cannot
-- revoke it. Run this only to unblock a deliberate, reviewed ownership move, and
-- re-apply 0126 immediately afterwards.
--
-- The column comments are restored to the 0111 text, which is the state before
-- this migration.

BEGIN;

drop trigger if exists token_credits_owner_immutable on public.token_credits;
drop function if exists public.token_credits_forbid_owner_transfer();

drop trigger if exists credit_transactions_owner_immutable on public.credit_transactions;
drop function if exists public.credit_transactions_forbid_owner_transfer();

comment on column public.token_credits.credits_allocated_cents is null;

comment on column public.token_credits.top_up_allocated_cents is
  'Purchased-credit portion of credits_allocated_cents. Unused purchases carry across periods and purchases older than 12 months are excluded at renewal.';

delete from public.schema_migrations where filename = '0126_credit_balance_transferability.sql';

COMMIT;
