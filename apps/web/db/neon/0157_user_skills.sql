-- 0157 — user-authored skills for the in-browser Skill editor.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- Web could only ever view and download skills; the underlying loader in
-- @agiworkforce/skills reads from local filesystem layers, which has no
-- meaning on serverless Vercel. This table is the durable, per-user
-- equivalent of the "personal" layer, read through the same
-- getUserScopedDb/RLS pattern as user_custom_connectors and
-- plugin_installations rather than a filesystem path.
--
-- The body column stores the SKILL.md instructions only, not the frontmatter
-- fence: name and description are their own columns, and the API route
-- reconstitutes the fence with buildSkillMarkdown (packages/tools/skills)
-- whenever a full SKILL.md needs to be produced. Storing them separately
-- keeps a name change from requiring a body rewrite and keeps the unique
-- constraint enforceable in SQL instead of by parsing markdown.

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  description text not null check (char_length(description) between 1 and 1000),
  body text not null check (char_length(body) between 1 and 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_skills_user_name_unique unique (user_id, name)
);

create index if not exists idx_user_skills_user_id
  on public.user_skills (user_id, name);

grant select, insert, update, delete on public.user_skills to app_rls;

alter table public.user_skills enable row level security;
alter table public.user_skills force row level security;

drop policy if exists user_skills_user_isolation on public.user_skills;
create policy user_skills_user_isolation
  on public.user_skills for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.user_skills is
  'Per-user, cloud-persisted skills authored in the web Skill editor. Merged into the managed Skill catalog as source=personal, editable=true.';
