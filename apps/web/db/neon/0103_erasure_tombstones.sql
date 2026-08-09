-- 0103_erasure_tombstones.sql
--
-- PER-24 follow-up — the suppression list behind the DPA sentence "Restored
-- data is re-subjected to the same erasure on the next scheduled run"
-- (apps/web/app/dpa/page.tsx, Backups).
--
-- The purge cron's only queue was `profiles.deletion_scheduled_for`. That
-- column lives on the row the erasure deletes, so the queue died with the
-- account: once an erasure finished, nothing anywhere remembered that this user
-- id must stay erased. A snapshot restore that brought the rows back
-- resurrected the account permanently, and a restore that brought back only
-- child tables left personal data with no profile row for any query to find.
--
-- This table is that memory. One row per erased account, written when the
-- erasure starts and never deleted, so `GET /api/cron/purge-deleted-accounts`
-- can re-run the erasure against a subject whose data has reappeared.
--
-- WHAT THIS DOES NOT COVER, recorded rather than papered over:
--   * A whole-database point-in-time restore — the restore Neon actually
--     performs — rolls this table back with the data it protects. Restoring to
--     a point AFTER the erasure has nothing to resurrect; restoring to a point
--     BETWEEN the deletion request and the erasure is covered without a
--     tombstone, because the restored profile carries `deletion_scheduled_for`
--     and the cron's due queue selects on it; restoring to a point BEFORE the
--     request loses the request itself, and re-erasing that window is manual
--     until this list is exported outside Neon. What this table covers is the
--     partial restore: `profiles` or its child tables copied back while this
--     list stays current.
--   * Object storage. The re-erasure enumerates R2 objects from database rows
--     (`media_assets.storage_pathname`, knowledge `storage_uri`,
--     `profiles.avatar_url`), and this table stores no object keys, so objects
--     restored while their rows stay erased are not found or re-deleted.
--
-- `user_id` is the raw account id on purpose. A pseudonymized reference could
-- not be used as the predicate the re-erasure has to run.

create table if not exists public.erasure_tombstones (
  user_id text primary key,
  -- Last time an erasure ran for this subject, whether or not it found data.
  -- Doubles as the round-robin cursor for the cron's re-sweep.
  last_swept_at timestamptz not null default now(),
  -- Set the first time an erasure reported every table and every stored object
  -- gone, and never cleared after that, so it is also the record of when the
  -- obligation was first discharged. A null keeps the subject in the sweep
  -- queue unconditionally.
  erased_at timestamptz
);

-- NO INDEXES, deliberately. The only query that reads this table is the cron's
-- sweep, whose WHERE is an OR spanning a left join to `profiles` and whose
-- ORDER BY leads with that same join-derived expression, so Postgres scans,
-- joins and sorts the table however it is indexed. An index here would be
-- unusable weight. One daily scan of a table holding one row per erased account
-- is far cheaper than the five full erasures the same run performs; revisit
-- only alongside a sweep query that could actually use one.

-- 0037_rls_user_isolation.sql:84 grants every NEW table to app_rls by default
-- privilege, so this table would otherwise be readable and DELETE-able by the
-- per-user runtime role. A suppression list a user could empty is not a
-- suppression list. Only the owner connection (the purge cron) touches it.
revoke all on public.erasure_tombstones from app_rls;

-- Deny-all by construction: RLS is forced and NO policy is created, so a future
-- blanket `GRANT ... ON ALL TABLES IN SCHEMA public TO app_rls` (the re-grant
-- footgun documented in 0043) cannot resurrect access to this table.
alter table public.erasure_tombstones enable row level security;
alter table public.erasure_tombstones force row level security;
