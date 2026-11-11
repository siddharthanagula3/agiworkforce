-- Reversal of 0400: forget the owed owner notices and the review cursor.
--
-- WHAT THIS COSTS: the collection sweep reads and writes these columns, so the
-- code that retries owner notices and orders contracts by their last review
-- must be rolled back first or every sweep fails. Any owner notice still owed
-- is forgotten and never retried, and the sweep goes back to starting from the
-- most overdue contract on every run.

begin;

drop index if exists public.idx_organization_billing_contracts_collection_review;

alter table public.organization_billing_contracts
  drop constraint if exists organization_billing_contracts_owner_notice_complete,
  drop constraint if exists organization_billing_contracts_owner_notice_stage,
  drop column if exists collection_reviewed_at,
  drop column if exists owner_notice_in_app_recorded_at,
  drop column if exists owner_notice_email_delivered_at,
  drop column if exists owner_notice_pending_since,
  drop column if exists owner_notice_pending_stage;

delete from public.schema_migrations
 where filename = '0400_billing_collection_owner_notice_and_review_cursor.sql';

commit;
