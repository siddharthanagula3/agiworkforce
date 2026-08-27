-- Reversal of 0146 — retract only the repair ledger entry.
--
-- WHAT THIS COSTS: no application data. The column is intentionally retained
-- because migration 0072 owns it; dropping it would recreate the production
-- outage and erase valid ownership proofs. Re-applying 0146 remains idempotent.

begin;

comment on column public.github_installations.ownership_verified_at is
  'Set only after a GitHub App user access token proves this user can access the installation; NULL rows are legacy/untrusted and cannot mint tokens.';

delete from public.schema_migrations
 where filename = '0146_repair_github_installation_ownership.sql';

commit;
