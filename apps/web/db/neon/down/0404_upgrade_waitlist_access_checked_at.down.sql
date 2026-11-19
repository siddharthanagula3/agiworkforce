-- Reversal of 0404: forget when the upgrade waitlist scan last checked each
-- account.
--
-- WHAT THIS COSTS: the upgrades-open notice orders and stamps by this column,
-- so its code must be rolled back first or every run fails. Each run then
-- starts from the oldest account again, and accounts behind more closed ones
-- than a single run examines are never reached.

begin;

alter table public.waitlist
  drop column if exists upgrade_access_checked_at;

delete from public.schema_migrations
 where filename = '0404_upgrade_waitlist_access_checked_at.sql';

commit;
