-- Reversal of 0155 - forget which sandbox image and branch a Code session used.
--
-- WHAT THIS COSTS: existing sessions lose the record of the runtime they were
-- built from and the ref they cloned, so the UI falls back to reporting the
-- default image and the default branch for every session. No workspace or
-- session is destroyed; only the provenance columns go.

begin;

alter table public.cloud_code_sessions
  drop column if exists runtime_id;

alter table public.cloud_code_sessions
  drop column if exists repository_branch;

delete from public.schema_migrations
 where filename = '0155_cloud_code_session_runtime.sql';

commit;
