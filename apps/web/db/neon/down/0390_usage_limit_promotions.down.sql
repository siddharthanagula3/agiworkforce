-- Reversal of 0390: forget every usage-limit promotion and grant.
--
-- WHAT THIS COSTS: every banked reset an account holds is lost, every uplift
-- claim ends, and the record of what each promotion committed against its
-- ceiling is destroyed. Accounts whose windows were restarted by a reset in
-- the last week go back to counting the usage before it. Export both tables
-- first if any promotion has run.

begin;

drop table if exists public.usage_limit_promotion_grants;
drop table if exists public.usage_limit_promotions;

delete from public.schema_migrations
 where filename = '0390_usage_limit_promotions.sql';

commit;
