-- =============================================================================
-- Migration 0322: the files a personal skill bundles
--
-- Why    : a personal skill stored only its SKILL.md instructions, so a skill
--          uploaded as a folder lost the references, templates and scripts it
--          carried. Claude and ChatGPT keep a skill's folder whole: SKILL.md
--          plus references/, assets/ and scripts/, read while the skill runs
--          and executed in the code sandbox.
--
-- Shape  : one row per text file, keyed by the skill and the file's path
--          relative to the skill's folder. The body lives here because a
--          personal skill has no origin to fetch it from again. byte_size is
--          checked against the stored bytes rather than trusted, and the path
--          can never climb out of the folder. Files cascade with their skill
--          and with the account; user_id is carried so the owner policy and
--          account erasure never need a join.
--
-- Depends: 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at),
--          0157 (user_skills), 0278 (assign_cloud_sync_version)
-- =============================================================================

begin;

create table if not exists public.user_skill_files (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.user_skills(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  path text not null check (
    char_length(path) between 1 and 400
    and path !~ '(^/|(^|/)\.{1,2}(/|$)|\\)'
  ),
  content text not null check (char_length(content) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size = octet_length(content)),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint user_skill_files_skill_path_unique unique (skill_id, path)
);

create index if not exists user_skill_files_user_idx
  on public.user_skill_files (user_id);

drop trigger if exists set_user_skill_files_updated_at on public.user_skill_files;
create trigger set_user_skill_files_updated_at
  before update on public.user_skill_files
  for each row execute function public.set_row_updated_at();

drop trigger if exists user_skill_files_assign_version on public.user_skill_files;
create trigger user_skill_files_assign_version
  before insert or update on public.user_skill_files
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.user_skill_files from app_rls;
grant select, insert, update, delete on public.user_skill_files to app_rls;

alter table public.user_skill_files enable row level security;
alter table public.user_skill_files force row level security;

drop policy if exists user_skill_files_owner on public.user_skill_files;
create policy user_skill_files_owner
  on public.user_skill_files for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and skill_id in (
      select skills.id
        from public.user_skills skills
       where skills.user_id = (select public.current_app_user_id())
    )
  );

comment on table public.user_skill_files is
  'The files a personal skill bundles beside its SKILL.md: references, templates and scripts, one text file per row, with paths relative to the skill folder. Read by the skill tool while the skill runs and copied into the code sandbox when it bundles scripts.';

commit;
