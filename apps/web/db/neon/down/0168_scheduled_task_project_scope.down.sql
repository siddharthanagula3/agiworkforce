-- Reversal of 0168, drop the project scope column and its index.
--
-- Every schedule's project_id link is lost. Every other scheduled_tasks
-- column (prompt, cron_expression, status, execution history) survives
-- untouched; a schedule that was scoped to a project reverts to an
-- account-level schedule the same way it behaves today when project_id is
-- null, it just cannot remember which project it came from until 0168 is
-- re-applied.

begin;

drop index if exists public.idx_scheduled_tasks_project_id;

alter table public.scheduled_tasks
  drop column if exists project_id;

delete from public.schema_migrations
 where filename = '0168_scheduled_task_project_scope.sql';

commit;
