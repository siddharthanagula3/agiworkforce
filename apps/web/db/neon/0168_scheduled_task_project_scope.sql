-- 0168 : let a scheduled task belong to a project.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- Both leader products let a project host its own recurring tasks from the
-- project's own page (docs/research/leader-live-audit-2026-09-05.md, part 5,
-- gap row 7); scheduled_tasks (0009) carries no project reference at all, so
-- a schedule created from a project page had nowhere to record that origin
-- and the project page had nothing to list. project_id is nullable because
-- most schedules stay account-scoped, matching every other optional scope on
-- this table (organization_id from 0057's claim path). "on delete set null"
-- rather than cascade: deleting a project should not silently destroy a
-- standing automation the user built from inside it, it should fall back to
-- an ordinary account-level schedule the same way a chat's project link
-- degrades when its project is removed.

begin;

alter table public.scheduled_tasks
  add column if not exists project_id uuid references public.user_projects(id) on delete set null;

create index if not exists idx_scheduled_tasks_project_id
  on public.scheduled_tasks(project_id)
  where project_id is not null;

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Column exists, nullable, defaults to null for every existing row:
-- --    SELECT count(*) FROM public.scheduled_tasks WHERE project_id IS NOT NULL; -- expect 0
-- -- 2. A schedule can be scoped to a real project the same user owns:
-- --    UPDATE public.scheduled_tasks t SET project_id = p.id
-- --      FROM public.user_projects p
-- --     WHERE p.user_id = t.user_id
-- --     LIMIT 1;
-- -- 3. Deleting that project nulls the reference instead of deleting the task:
-- --    DELETE FROM public.user_projects WHERE id = (
-- --      SELECT project_id FROM public.scheduled_tasks WHERE project_id IS NOT NULL LIMIT 1
-- --    );
-- --    SELECT project_id FROM public.scheduled_tasks WHERE id = '<same task id>'; -- expect null
