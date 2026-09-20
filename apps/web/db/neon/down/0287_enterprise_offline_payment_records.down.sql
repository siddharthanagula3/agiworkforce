-- Reversal of the offline payment record.
--
-- COST, read this before running it: every recorded bank transfer is deleted,
-- so no enterprise invoice can be shown to have been settled by ACH or wire,
-- and the idempotency key that stopped one remittance being applied twice goes
-- with it. Export the table before running this if any row exists.

begin;

drop policy if exists enterprise_offline_payment_records_admin_report
  on public.enterprise_offline_payment_records;
drop policy if exists enterprise_offline_payment_records_admin_read
  on public.enterprise_offline_payment_records;

alter table if exists public.enterprise_offline_payment_records
  disable row level security;

drop index if exists public.idx_enterprise_offline_payments_organization;

drop table if exists public.enterprise_offline_payment_records;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0287_enterprise_offline_payment_records.sql';

commit;
