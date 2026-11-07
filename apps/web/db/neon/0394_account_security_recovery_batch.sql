begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
     where rolname = current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Recovery batch migration requires a privileged owner with BYPASSRLS';
  end if;
end;
$$;

alter table public.account_security_enrollments
  add column pending_recovery_batch_id text;

-- Active recovery keys survive; legacy pending keys have no acknowledged identity.
update public.account_security_enrollments
   set pending_recovery_key_hashes = null,
       pending_recovery_keys_expire_at = null,
       pending_recovery_session_id = null;

alter table public.account_security_enrollments
  add constraint account_security_pending_batch_shape check (
    (pending_recovery_batch_id is null) = (pending_recovery_key_hashes is null)
    and (pending_recovery_batch_id is null or pending_recovery_batch_id ~ '^[A-Za-z0-9_-]{43}$')
  );

-- A mixed-version writer must not replace hashes while retaining a newer receipt.
-- Old promotion/clear SQL leaves the receipt behind and fails the shape constraint.
create function public.require_new_recovery_batch_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.pending_recovery_key_hashes is not null
     and new.pending_recovery_batch_id is not distinct from old.pending_recovery_batch_id
     and (
       new.pending_recovery_key_hashes is distinct from old.pending_recovery_key_hashes
       or new.pending_recovery_keys_expire_at is distinct from old.pending_recovery_keys_expire_at
       or new.pending_recovery_session_id is distinct from old.pending_recovery_session_id
     ) then
    raise exception using errcode = '23514', message = 'Generate recovery keys with a new batch identity';
  end if;
  return new;
end;
$$;

create trigger require_new_recovery_batch_identity
  before update on public.account_security_enrollments
  for each row execute function public.require_new_recovery_batch_identity();

commit;
