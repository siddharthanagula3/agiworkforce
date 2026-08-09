-- Reverses 0103_erasure_tombstones.sql.
--
-- DROPS A SUPPRESSION LIST. Each row is the memory that a named subject asked
-- to be erased and must stay erased; without the table, a snapshot restore
-- resurrects those accounts permanently and nothing re-runs the erasure. That
-- is the deletion obligation itself, not a cache of it, so rolling this back
-- with rows present needs the erasure work rolled back with it.
--
-- Export first, always:
--   \copy public.erasure_tombstones to 'erasure-tombstones.csv' csv header
--
-- The table owns both its indexes, so dropping it takes them; the revoke and
-- the forced RLS in 0103 are table-scoped and go the same way.

begin;

drop table if exists public.erasure_tombstones;

delete from public.schema_migrations where filename = '0103_erasure_tombstones.sql';

commit;
