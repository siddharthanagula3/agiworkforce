-- Reversal of 0151 — remove Web Push registrations.
--
-- WHAT THIS COSTS: every browser that had opted in stops receiving agent-run
-- notifications and has to opt in again. Nothing else is affected: the
-- registration holds no message history and no credential for this product.

begin;

drop policy if exists web_push_subscriptions_user_isolation on public.web_push_subscriptions;
drop index if exists public.idx_web_push_subscriptions_user_id;
drop table if exists public.web_push_subscriptions;

delete from public.schema_migrations
 where filename = '0151_web_push_subscriptions.sql';

commit;
