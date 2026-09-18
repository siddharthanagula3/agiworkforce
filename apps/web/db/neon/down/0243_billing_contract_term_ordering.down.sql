-- Reversal of 0243, drop the contract term ordering constraint.
--
-- COST, read this before running it: after this an inverted or zero-length
-- contract term can be written again, and the enterprise contract panel will
-- show a term that ends before it begins. Nothing is lost, but nothing stops it
-- coming back either.

begin;

do $$
begin
  if to_regclass('public.organization_billing_contracts') is not null then
    alter table public.organization_billing_contracts
      drop constraint if exists organization_billing_contracts_term_runs_forwards;
  end if;
end $$;

delete from public.schema_migrations
 where filename = '0243_billing_contract_term_ordering.sql';

commit;
