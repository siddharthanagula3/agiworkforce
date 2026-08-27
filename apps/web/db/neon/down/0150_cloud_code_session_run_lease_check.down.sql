-- Reversal of 0150 — drop the managed Code session lease invariant.
--
-- WHAT THIS COSTS: nothing at runtime. The lease columns stay, the code keeps
-- writing them, and the claim predicate keeps working; only the database's
-- guarantee that `state = 'running'` implies a live lease row is gone. This is
-- the file to run before rolling the writing code back, since the old code
-- writes `running` rows with no lease and would otherwise fail the constraint.
--
-- The rows 0150 repaired are not un-repaired: giving a wedged session a past
-- expiry is a fix, and restoring the wedge would only reproduce the incident.

begin;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_run_lease_chk;

delete from public.schema_migrations
 where filename = '0150_cloud_code_session_run_lease_check.sql';

commit;
