-- Reversal of 0348 : Ask from Siri tokens are dropped.
--
-- WHAT THIS COSTS: every Ask from Siri token stops working; the intent answers
-- "Open AGI Workforce to sign in" until the app issues a new one after the
-- table is restored.

begin;

drop policy if exists mobile_intent_tokens_user_isolation on public.mobile_intent_tokens;
drop index if exists public.mobile_intent_tokens_live_install;
drop table if exists public.mobile_intent_tokens;

delete from public.schema_migrations
 where filename = '0348_mobile_intent_tokens.sql';

commit;
