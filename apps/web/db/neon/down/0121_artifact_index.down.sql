-- Down for 0120: drop the account-wide artifact index.
--
-- Safe to run at any time. The index holds NO content — only metadata pointing
-- at the message that produces each artifact — so dropping it destroys nothing
-- that cannot be rebuilt by re-deriving from `web_messages`. The cost of the
-- rollback is discovery, not data: the Artifacts gallery falls back to showing
-- only the conversations the current device has opened, which is exactly its
-- behaviour before 0120.
--
-- Dropping the table takes its policy and both indexes with it; they are named
-- here so the reversal accounts for every object 0120 creates.

begin;

drop policy if exists web_artifact_index_user_isolation on public.web_artifact_index;

drop index if exists public.idx_web_artifact_index_user;
drop index if exists public.idx_web_artifact_index_message;

-- RLS toggles (ENABLE + FORCE) live on the table and retire with it.
alter table if exists public.web_artifact_index no force row level security;
alter table if exists public.web_artifact_index disable row level security;

drop table if exists public.web_artifact_index;

-- Retire the ledger row, or `db:migrate` considers 0120 still applied and will
-- never re-run it after a rollback.
delete from public.schema_migrations where filename = '0121_artifact_index.sql';

commit;
