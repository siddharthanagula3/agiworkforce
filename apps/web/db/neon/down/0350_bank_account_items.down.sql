-- Reversal of 0350 : linked banks go back to the single connector grant.
--
-- WHAT THIS COSTS: every bank link but the latest stops being read, and the
-- per-account choices are lost. Remove the extra Plaid items first.

begin;

drop policy if exists bank_account_items_user_isolation on public.bank_account_items;
drop table if exists public.bank_account_items;

delete from public.schema_migrations
 where filename = '0350_bank_account_items.sql';

commit;
