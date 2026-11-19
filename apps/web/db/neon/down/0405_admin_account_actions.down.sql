-- Reversal of 0405: drop the stored provider step of operator account actions.
--
-- WHAT THIS COSTS: the admin security route records every suspend, ban and
-- reactivation here and the background job retries failed provider steps from
-- it. Roll that code back first. Account status itself is untouched, but every
-- unfinished provider step is forgotten: a reactivated customer the provider
-- still blocks stays blocked, and a banned account the provider still lets in
-- stays let in, until an operator resubmits the action. Queued
-- webhooks.identity-account-status jobs can no longer read their action and
-- end in the dead-letter view.

begin;

drop table if exists public.admin_account_actions;

delete from public.schema_migrations
 where filename = '0405_admin_account_actions.sql';

commit;
