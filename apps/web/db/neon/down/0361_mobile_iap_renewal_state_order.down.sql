-- Reversal of 0361 : the signature time of the newest renewal-state notice is
-- dropped.
--
-- WHAT THIS COSTS: the recorded times are lost, and the notification handler
-- that reads the column fails until the forward migration is applied again or
-- the handler is rolled back with it.

begin;

alter table public.mobile_iap_accounts
  drop column if exists renewal_state_signed_at;

delete from public.schema_migrations
 where filename = '0361_mobile_iap_renewal_state_order.sql';

commit;
