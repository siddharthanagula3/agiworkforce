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
--          revoked_at is never cleared: an ended family stays ended.
--          The table is reached only on the owner connection, as
--          device_refresh_tokens is, so it carries no row-level security and
--          app_rls has no grant on it.
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

revoke all on public.device_refresh_token_families from public;

comment on table public.device_refresh_token_families is
  'One row per device refresh credential family. Rotation locks it and refuses a revoked family; every revocation sets revoked_at here before revoking the token rows. revoked_at is never cleared.';
comment on column public.device_refresh_token_families.revoked_at is
  'When the family was ended (unlink, sign-out, compromise, deprovision). Null means not ended.';

commit;
