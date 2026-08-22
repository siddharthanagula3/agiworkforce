-- Reversal of 0132 — drop the goodwill-grant column and its reporting index.
--
-- WHAT THIS COSTS: the record of how much allocated credit was granted rather
-- than sold is destroyed, so revenue reporting can no longer separate goodwill
-- from revenue without replaying credit_transactions. Balances are untouched —
-- credits_allocated_cents already includes every grant and is not changed here,
-- so no user loses credit they were given.

begin;

drop index if exists public.idx_credit_transactions_type_created;

alter table if exists public.token_credits
  drop column if exists bonus_granted_cents;

delete from public.schema_migrations
 where filename = '0132_operator_bonus_credits.sql';

commit;
