-- Reversal of 0231, drop the record of what the backup bucket holds.
--
-- The copies themselves stay in the backup bucket; what is lost is the ability
-- to propagate a deletion to them, so after this reversal an object erased from
-- the primary survives in the backup again, and the recovery point of one
-- object is once more unanswerable without reading the other bucket.

begin;

drop index if exists public.idx_object_backup_replicas_verified;

drop table if exists public.object_backup_replicas;

delete from public.schema_migrations
 where filename = '0231_object_backup_replicas.sql';

commit;
