-- =============================================================================
-- Migration 0411: a device refresh credential family can be ended for good
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : Unlinking a device, signing out everywhere, signing out one device
--          and finishing a compromised family each revoked the family's token
--          rows with one UPDATE. Under READ COMMITTED that UPDATE waits on a
--          concurrent rotation's row lock and then finishes against the rows it
--          saw when it started, so the successor the rotation committed stayed
--          live: settings said the device was unlinked while it kept refreshing
--          and its access tokens kept passing admission. A second UPDATE pass
--          only narrowed the window; the successor can rotate again before it.
--
-- Shape  : device_refresh_token_families holds one row per credential family,
--          keyed by family_id, with the account it belongs to and revoked_at.
--          Every rotation takes this row's lock (inserting it when missing)
--          before it locks the presented token, and refuses a family whose
--          revoked_at is set. Every revocation sets revoked_at on the row first
--          and then revokes the token rows, so a rotation either committed
--          before the revocation took the lock, and its successor is visible to
--          the revoking statement that follows, or it waits and is refused.
--          Developer-token admission refuses a family whose row is revoked.
--          revoked_at is never cleared: an ended family stays ended, and a
--          trigger refuses an update that clears it or moves a family to
--          another account.
--          Rotation and developer-token admission use the owner connection.
--          An account's own sign-out paths and an admin's directory-sync
--          deprovision end families through app_rls, as they revoke
--          device_refresh_tokens, so like that table it carries no row-level
--          security. app_rls gets select, insert and update (the fence and the
--          rotation lock are upserts) and no delete: a family with no row
--          counts as not ended, so deleting the row would revive it.
--
-- Empty  : no rows. A family gets its row on its next rotation or revocation;
--          a family with no row is treated as not revoked, which is what its
--          token rows already say.
--
-- Depends: 0080 (device_refresh_tokens), 0133 (device_id on the token rows)
-- =============================================================================

begin;

create table if not exists public.device_refresh_token_families (
  family_id uuid primary key,
  user_id text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_refresh_token_families_user
  on public.device_refresh_token_families (user_id);

revoke all on public.device_refresh_token_families from public, app_rls;
grant select, insert, update on public.device_refresh_token_families to app_rls;

create or replace function public.device_refresh_token_families_stay_ended()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'An ended device refresh credential family stays ended.'
      using errcode = 'check_violation';
  end if;
  if new.user_id is distinct from old.user_id or new.family_id is distinct from old.family_id then
    raise exception 'A device refresh credential family keeps its account.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists device_refresh_token_families_stay_ended
  on public.device_refresh_token_families;
create trigger device_refresh_token_families_stay_ended
  before update on public.device_refresh_token_families
  for each row execute function public.device_refresh_token_families_stay_ended();

comment on table public.device_refresh_token_families is
  'One row per device refresh credential family. Rotation locks it and refuses a revoked family; every revocation sets revoked_at here before revoking the token rows. revoked_at is never cleared.';
comment on column public.device_refresh_token_families.revoked_at is
  'When the family was ended (unlink, sign-out, compromise, deprovision). Null means not ended.';

commit;
