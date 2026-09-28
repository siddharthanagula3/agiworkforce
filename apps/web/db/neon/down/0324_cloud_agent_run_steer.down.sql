-- Reversal of 0324 : a running cloud agent run stops taking messages.
--
-- WHAT THIS COSTS: any message a user queued for a running task that the
-- executor had not read yet is discarded. Runs, their events and every message
-- the executor already read are kept.

begin;

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_pending_steer_check;

alter table public.cloud_agent_runs
  drop column if exists pending_steer;

delete from public.schema_migrations
 where filename = '0324_cloud_agent_run_steer.sql';

commit;
