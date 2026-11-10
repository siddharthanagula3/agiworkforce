-- Reversal of 0401: forget each ended contract's overage closeout.
--
-- WHAT THIS COSTS: the usage reporter reads and writes these columns, so the
-- code that closes out ended contracts must be rolled back first or every
-- overage report fails. The record of which tails were written off, how much
-- and when, and the identifier of any pending report a closeout dropped is
-- lost and cannot be rebuilt. Ended contracts again keep an unreported tail
-- with no reader. Pending reports a closeout already cleared are not restored.

begin;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_overage_closeout_values,
  drop constraint if exists organization_billing_contracts_overage_closeout_complete,
  drop column if exists overage_written_off_unconfirmed_identifier,
  drop column if exists overage_written_off_cents,
  drop column if exists overage_closeout_reason,
  drop column if exists overage_closeout_at,
  drop column if exists overage_closeout_ended_at;

delete from public.schema_migrations
 where filename = '0401_overage_contract_closeout.sql';

commit;
