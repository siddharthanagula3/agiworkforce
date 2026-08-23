-- Project-scoped memory.
--
-- Memory was a single per-user pool: every fact learned in any conversation was
-- injected into every other one. A user with a client project and a personal
-- project got the client's facts in their personal chats and vice versa, with no
-- way to separate them. This is the one thing a project is FOR.
--
-- project_id null means the memory is global — it applies everywhere, which is
-- exactly today's behaviour, so every existing row keeps working unchanged. A
-- non-null project_id confines the memory to that project and NOWHERE else:
-- outside it the fact must not appear, or "project memory" means nothing.
alter table public.user_memories
  add column if not exists project_id uuid references public.user_projects(id) on delete cascade;

comment on column public.user_memories.project_id is
  'Null = global memory, used in every conversation. Non-null = confined to that project and invisible outside it.';

-- The read path filters by user, deletion and now project on every turn, so the
-- partial index carries project_id alongside the columns already in the live
-- query rather than adding a second index to maintain.
drop index if exists public.idx_user_memories_user_id;
create index if not exists idx_user_memories_user_scope
  on public.user_memories (user_id, project_id, pinned desc, updated_at desc)
  where is_deleted = false;

-- Whether a project also draws on global memory. Default true keeps today's
-- behaviour for every existing project; turning it off makes the project read
-- ONLY its own memories, which is what a confidential engagement needs.
alter table public.user_projects
  add column if not exists uses_global_memory boolean not null default true;

comment on column public.user_projects.uses_global_memory is
  'False = conversations in this project see only this project''s memories, never the account-wide pool.';
