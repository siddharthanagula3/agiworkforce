-- Stop recovery writers from the newer release before rolling back.
-- Pending batches and their proofs are discarded; active recovery keys survive.
-- Legacy pending keys cleared by the forward migration cannot be restored.
begin;

lock table public.account_security_enrollments in access exclusive mode;

drop trigger require_new_recovery_batch_identity on public.account_security_enrollments;
drop function public.require_new_recovery_batch_identity();

update public.account_security_enrollments
   set pending_recovery_batch_id = null,
       pending_recovery_key_hashes = null,
       pending_recovery_keys_expire_at = null,
       pending_recovery_session_id = null
 where pending_recovery_batch_id is not null
    or pending_recovery_key_hashes is not null
    or pending_recovery_keys_expire_at is not null
    or pending_recovery_session_id is not null;

alter table public.account_security_enrollments
  drop constraint account_security_pending_batch_shape,
  drop column pending_recovery_batch_id;

delete from public.schema_migrations
where filename = '0394_account_security_recovery_batch.sql';

commit;
