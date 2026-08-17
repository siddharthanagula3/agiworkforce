-- Down for 0122: drop the rights-holder takedown notice queue.
--
-- READ THIS BEFORE ROLLING BACK. Unlike an index or a derived cache, this table
-- holds the ONLY structured record of legal notices served on the operator, and
-- nothing else in the schema reproduces it. `security_audit_logs` carries a
-- parallel 'content_notice' event for each intake, so the fact that a notice
-- arrived survives — but the reporter's affirmations and the disposition
-- (actioned / rejected / counter_notified) do not, because the audit log has no
-- status field. That loss is the entire reason 0122 exists.
--
-- So this reversal is safe for a rollback that happens minutes after the deploy,
-- and destructive for one that happens after real notices have been worked.
-- Export first if any row has a status other than 'received':
--
--   \copy (select * from public.copyright_notices) to 'copyright_notices.csv' csv header
--
-- Dropping the table takes both indexes with it; they are named here so the
-- reversal accounts for every object 0122 creates.

begin;

drop index if exists public.idx_copyright_notices_open;
drop index if exists public.idx_copyright_notices_target;

-- RLS toggles (ENABLE + FORCE) live on the table and retire with it.
alter table if exists public.copyright_notices no force row level security;
alter table if exists public.copyright_notices disable row level security;

drop table if exists public.copyright_notices;

-- Retire the ledger row, or `db:migrate` considers 0122 still applied and will
-- never re-run it after a rollback.
delete from public.schema_migrations where filename = '0122_copyright_notices.sql';

commit;
