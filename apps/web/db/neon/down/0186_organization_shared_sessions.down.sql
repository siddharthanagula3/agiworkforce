-- Reversal of 0186 : drop organization sharing for shared conversations.
--
-- WHAT THIS COSTS: every workspace-only conversation share. Dropping the grant
-- table destroys the record of which shares were aimed at which organization,
-- and it cannot be reconstructed from the share rows. Re-applying 0186 gives
-- back an empty shared set, so each owner must share again.
--
-- WHAT IT EXPOSES: dropping `visibility` returns every row to the 0051 rule
-- that knowledge of the token is the read grant. A conversation that was
-- workspace-only becomes readable by anyone holding its link again, until it
-- expires. If that matters for a given row, revoke the share first
-- (DELETE /api/share/<token>) and roll back afterwards.
--
-- ROLLBACK ORDER: application code first. A deploy still running 0186's page
-- reads `visibility` in its SELECT list and its anonymous read predicate, so it
-- fails with 42703 the moment the column is gone.

begin;

drop policy if exists shared_sessions_org_shared_read on public.shared_sessions;
drop policy if exists shared_sessions_owner_update on public.shared_sessions;
drop policy if exists shared_sessions_owner_read on public.shared_sessions;

alter table public.shared_sessions no force row level security;
alter table public.shared_sessions disable row level security;

revoke select, update on public.shared_sessions from app_rls;

drop table if exists public.organization_shared_sessions;

alter table public.shared_sessions
  drop constraint if exists shared_sessions_visibility_check;

alter table public.shared_sessions
  drop column if exists visibility;

delete from public.schema_migrations
  where filename = '0186_organization_shared_sessions.sql';

commit;
