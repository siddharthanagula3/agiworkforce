-- Reversal of 0149 — drop the managed Code session run lease columns.
--
-- WHAT THIS COSTS: the claim over a Code session goes back to having no
-- expiry, so a turn the platform kills mid-flight wedges its session at
-- `running` permanently again. Any lease a live run is currently holding is
-- destroyed with the columns, so two runs can briefly drive one sandbox while
-- the code that reads them is still deployed — revert the code first. The
-- state column and every transition it drives are untouched.
--
-- ORDER: 0150 must be reverted before this file. Dropping these columns would
-- take `cloud_code_sessions_run_lease_chk` with them (Postgres drops any
-- constraint that references a dropped column) while leaving 0150 recorded as
-- applied, so `db:migrate` would never restore the constraint. The guard below
-- refuses rather than letting that happen quietly.

begin;

do $$
begin
  if exists (
    select 1
      from public.schema_migrations
     where filename = '0150_cloud_code_session_run_lease_check.sql'
  ) then
    raise exception
      'Revert 0150_cloud_code_session_run_lease_check.sql before 0149: dropping these columns would drop cloud_code_sessions_run_lease_chk while 0150 stays recorded as applied';
  end if;
end
$$;

drop index if exists public.cloud_code_sessions_expired_lease_idx;

alter table public.cloud_code_sessions
  drop column if exists run_lease_expires_at,
  drop column if exists run_lease_token;

delete from public.schema_migrations
 where filename = '0149_cloud_code_session_run_lease.sql';

commit;
