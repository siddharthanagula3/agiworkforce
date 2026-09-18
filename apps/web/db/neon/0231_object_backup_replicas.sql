-- 0231 : what the backup bucket is holding, so a deletion in the primary can
--        reach the copy and a restore can say when the copy was taken.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The hourly replication in apps/web/lib/server/object-backup.ts copies objects
-- into a second bucket and then forgets them. Two questions had no answer.
--
-- The first is deletion. The backup was a copy of everything that had ever
-- existed, never a mirror: an object erased from the primary, by an account
-- erasure, by the media purge after its recovery window, or by a retention
-- sweep, stayed in the backup bucket indefinitely. Restoring from it would have
-- reintroduced data a subject asked to have removed. There is no delete
-- notification any of those paths guarantees, so the reconciliation sweep asks
-- the primary about each key it has recorded here and removes the copy of a key
-- the primary no longer holds. verified_at is when that question was last
-- asked, and ordering by it makes the sweep a round robin rather than a rescan
-- of the same head of the table.
--
-- The second is evidence. 'Is this object in the backup, and as of when' was
-- answerable only by reading the other bucket with a credential. replicated_at
-- is the recovery point for one object, and the oldest verified_at is the age
-- of the backup's weakest claim.
--
-- No user_id: an object key is not a subject here, and the sweep that reads
-- this table runs with no caller identity. It is platform state, so it is not
-- granted to app_rls at all rather than granted and then policed.

create table if not exists public.object_backup_replicas (
  object_key text primary key check (char_length(object_key) between 1 and 1024),
  backup_bucket text not null check (char_length(backup_bucket) between 1 and 255),
  bytes bigint not null check (bytes >= 0),
  replicated_at timestamptz not null default now(),
  verified_at timestamptz not null default now()
);

create index if not exists idx_object_backup_replicas_verified
  on public.object_backup_replicas (verified_at asc);

comment on table public.object_backup_replicas is
  'One row per object the hourly sweep has copied into the backup bucket. Platform state with no tenant scope: not granted to app_rls, read and written only by the scheduler-authenticated replication route.';
comment on column public.object_backup_replicas.replicated_at is
  'When the copy in the backup bucket was last written. The recovery point for this one object.';
comment on column public.object_backup_replicas.verified_at is
  'When the primary was last asked whether this key still exists. The sweep takes the oldest first, so this doubles as the round-robin cursor.';

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The table exists and app_rls cannot reach it:
-- --    SELECT has_table_privilege('app_rls', 'public.object_backup_replicas', 'SELECT');
-- --    EXPECT: f
--
-- -- 2. A second copy of the same key updates rather than duplicates:
-- --    INSERT INTO public.object_backup_replicas (object_key, backup_bucket, bytes)
-- --    VALUES ('private-media/image/a/1.png', 'agi-backup', 10)
-- --    ON CONFLICT (object_key) DO UPDATE SET bytes = excluded.bytes;
-- --    INSERT ... VALUES ('private-media/image/a/1.png', 'agi-backup', 20)
-- --    ON CONFLICT (object_key) DO UPDATE SET bytes = excluded.bytes;
-- --    SELECT count(*), max(bytes) FROM public.object_backup_replicas;
-- --    EXPECT: 1 | 20
--
-- -- 3. A negative size is refused:
-- --    INSERT INTO public.object_backup_replicas (object_key, backup_bucket, bytes)
-- --    VALUES ('k', 'agi-backup', -1);
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. Clean up:
-- --    DELETE FROM public.object_backup_replicas;
-- =============================================================================
