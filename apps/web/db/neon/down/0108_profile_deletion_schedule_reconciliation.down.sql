-- Reversal of 0108 — retract only the reconciliation ledger entry.
--
-- Migration 0071 owns these profile columns and their partial index in the
-- canonical sequence. Dropping them while rolling back 0108 would damage a
-- normally migrated database, so the reversal deliberately retains the
-- earlier-owned objects and only makes 0108 pending again.

BEGIN;

select
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'deletion_requested_at'
  ) as deletion_requested_at_retained,
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'deletion_scheduled_for'
  ) as deletion_scheduled_for_retained,
  to_regclass('public.idx_profiles_deletion_scheduled_for')
    as idx_profiles_deletion_scheduled_for;

delete from public.schema_migrations
 where filename = '0108_profile_deletion_schedule_reconciliation.sql';

COMMIT;
