-- Down for 0125: drop the per-run settled usage and cost record.
--
-- Destroys only a display copy. The authoritative money movement stays in
-- `managed_usage_requests` and the per-provider-call receipts stay in
-- `cloud_agent_execution_operations`; rolling back costs the Tasks panel its
-- per-task cost line, not the ledger.

begin;

alter table public.cloud_agent_runs drop column if exists settled_usage;

delete from public.schema_migrations
 where filename = '0125_cloud_agent_run_settled_usage.sql';

commit;
