-- Reversal of 0135 — remove project scoping from memory.
--
-- WHAT THIS COSTS: every memory confined to a project becomes global again, so
-- facts a user deliberately separated start appearing in unrelated
-- conversations. Any project set to exclude global memory silently starts
-- drawing on the account-wide pool again. No memory row is deleted, but the
-- separation is destroyed and cannot be reconstructed.

begin;

drop index if exists public.idx_user_memories_user_scope;

create index if not exists idx_user_memories_user_id
  on public.user_memories (user_id)
  where is_deleted = false;

alter table public.user_projects
  drop column if exists uses_global_memory;

alter table public.user_memories
  drop column if exists project_id;

delete from public.schema_migrations
 where filename = '0135_project_scoped_memory.sql';

commit;
