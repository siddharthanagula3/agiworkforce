-- Reversal of 0297 : removes auto-reload settings and the PaymentIntent receipt
-- guard.
--
-- WHAT THIS COSTS: every account's auto-reload choice, its threshold and pack,
-- the failure that last turned it off, and the stored record of its consent to
-- off-session charges are deleted, so no reload runs until a user consents again
-- under a re-applied 0297. The auto_reload_changed audit events, with the IP,
-- user agent and consent version of each change, stay in security_audit_logs as
-- the remaining evidence of those consents. A reload whose PaymentIntent is
-- still in flight loses its lease; the Stripe webhook still grants the credits
-- it paid for, but without the receipt index a webhook redelivery racing another
-- grant path could credit one PaymentIntent twice. Purchased credits, the ledger
-- and Checkout top-up receipts (0111) are untouched.

begin;

drop policy if exists auto_reload_settings_owner on public.auto_reload_settings;
drop index if exists public.idx_credit_transactions_top_up_payment_intent_receipt;
drop index if exists public.idx_auto_reload_settings_sweep;
drop table if exists public.auto_reload_settings;

delete from public.schema_migrations
 where filename = '0297_auto_reload_settings.sql';

commit;
