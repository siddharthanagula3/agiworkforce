begin;

drop trigger if exists require_new_recovery_batch_identity on public.account_security_enrollments;
drop function if exists public.require_new_recovery_batch_identity();

alter table public.account_security_enrollments
  drop constraint if exists account_security_pending_batch_shape;

alter table public.account_security_enrollments
  drop column if exists pending_recovery_batch_id;

delete from public.schema_migrations
where filename = '0394_account_security_recovery_batch.sql';

commit;
