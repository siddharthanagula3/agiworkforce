-- Reversal of 0233, remove break-glass support access and its trail.
--
-- COST, read this before running it: this drops `support_access_events`, which
-- is the evidence that support access was governed at all. Every grant, every
-- read taken under one and every read refused goes with it, and the hash chain
-- that made a deletion detectable goes with it too, so nothing afterwards can
-- say what the trail held. Export both tables before running this if any grant
-- has ever been approved. The reversal also removes the only gate over
-- operator reads: after it, `assertSupportAccess` has no tables to consult and
-- support-principal key resolution fails closed rather than falling open, but
-- nothing records the attempts.

begin;

drop policy if exists support_access_events_workspace_read on public.support_access_events;
drop policy if exists support_access_grants_workspace_read on public.support_access_grants;

alter table public.support_access_events disable row level security;
alter table public.support_access_grants disable row level security;

drop trigger if exists support_access_events_append_only on public.support_access_events;
drop function if exists public.support_access_events_are_append_only();

drop index if exists public.idx_support_access_events_grant;
drop index if exists public.idx_support_access_events_organization;

drop table if exists public.support_access_events;

drop trigger if exists set_support_access_grants_updated_at on public.support_access_grants;

drop index if exists public.idx_support_access_grants_live;
drop index if exists public.idx_support_access_grants_organization;

alter table if exists public.support_access_grants
  drop constraint if exists support_access_grants_scopes_are_named,
  drop constraint if exists support_access_grants_revocation_is_dated,
  drop constraint if exists support_access_grants_is_time_boxed,
  drop constraint if exists support_access_grants_needs_a_second_approver,
  drop constraint if exists support_access_grants_approval_is_complete;

drop table if exists public.support_access_grants;

delete from public.schema_migrations
 where filename = '0229_support_access_grants.sql';

commit;
