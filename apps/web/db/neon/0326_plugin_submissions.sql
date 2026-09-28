-- =============================================================================
-- Migration 0326: submit a plugin to the community directory for review
--
-- Why    : only platform administrators could publish a plugin, so a
--          developer could install their own plugin privately but never list
--          it for others. Claude's directory and ChatGPT's apps take a
--          submission, review it, and publish it once it is approved.
--
-- Shape  : plugin_submissions is one submitted version of a plugin a user
--          uploaded or created, with its scan result and review state:
--          pending, approved, rejected with a note, withdrawn by its
--          submitter, or suspended after approval. A plugin has at most one
--          version in review and one approved; approving a new version
--          withdraws the one it replaces and moves its installs onto it,
--          which is how a publisher ships an update. plugin_submission_files
--          is the snapshot of its files taken when it was submitted, so
--          review and every install see exactly what was submitted.
--          plugin_submission_installs is one user's install of an approved
--          submission, with its own switch and per-skill choices. Approved
--          submissions and their files are readable by every signed-in
--          account; everything else is readable only by its owner, and
--          review decisions are written by the platform's operator console.
--
-- Depends: 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at),
--          0159 and 0175 (plugin_marketplace_entries), 0278
--          (assign_cloud_sync_version)
-- =============================================================================

begin;

create table if not exists public.plugin_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  source_entry_id uuid references public.plugin_marketplace_entries(id) on delete set null,
  plugin_key text not null check (plugin_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 2000),
  version text not null check (char_length(version) between 1 and 64),
  category text check (category is null or char_length(category) between 1 and 100),
  skills jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  publisher_name text not null check (char_length(publisher_name) between 1 and 200),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  scan_verdict text not null check (scan_verdict in ('pass', 'review')),
  scan_findings jsonb not null default '[]'::jsonb check (jsonb_typeof(scan_findings) = 'array'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'suspended')),
  review_note text check (review_note is null or char_length(review_note) between 1 and 2000),
  reviewed_by text check (reviewed_by is null or char_length(reviewed_by) <= 200),
  reviewed_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint plugin_submissions_decision_has_note
    check (status not in ('rejected', 'suspended') or review_note is not null)
);

create index if not exists plugin_submissions_user_idx
  on public.plugin_submissions (user_id, created_at desc);
create index if not exists plugin_submissions_status_idx
  on public.plugin_submissions (status, created_at desc);
create unique index if not exists plugin_submissions_pending_key_idx
  on public.plugin_submissions (user_id, plugin_key)
  where status = 'pending';
create unique index if not exists plugin_submissions_approved_key_idx
  on public.plugin_submissions (user_id, plugin_key)
  where status = 'approved';

drop trigger if exists set_plugin_submissions_updated_at on public.plugin_submissions;
create trigger set_plugin_submissions_updated_at
  before update on public.plugin_submissions
  for each row execute function public.set_row_updated_at();

drop trigger if exists plugin_submissions_assign_version on public.plugin_submissions;
create trigger plugin_submissions_assign_version
  before insert or update on public.plugin_submissions
  for each row execute function public.assign_cloud_sync_version();

create table if not exists public.plugin_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.plugin_submissions(id) on delete cascade,
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
  constraint plugin_submission_files_path_unique unique (submission_id, path)
);

create index if not exists plugin_submission_files_user_idx
  on public.plugin_submission_files (user_id);

drop trigger if exists set_plugin_submission_files_updated_at on public.plugin_submission_files;
create trigger set_plugin_submission_files_updated_at
  before update on public.plugin_submission_files
  for each row execute function public.set_row_updated_at();

drop trigger if exists plugin_submission_files_assign_version on public.plugin_submission_files;
create trigger plugin_submission_files_assign_version
  before insert or update on public.plugin_submission_files
  for each row execute function public.assign_cloud_sync_version();

create table if not exists public.plugin_submission_installs (
  submission_id uuid not null references public.plugin_submissions(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  enabled_skills jsonb check (enabled_skills is null or jsonb_typeof(enabled_skills) = 'array'),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  primary key (submission_id, user_id)
);

create index if not exists plugin_submission_installs_user_idx
  on public.plugin_submission_installs (user_id);

drop trigger if exists set_plugin_submission_installs_updated_at on public.plugin_submission_installs;
create trigger set_plugin_submission_installs_updated_at
  before update on public.plugin_submission_installs
  for each row execute function public.set_row_updated_at();

drop trigger if exists plugin_submission_installs_assign_version on public.plugin_submission_installs;
create trigger plugin_submission_installs_assign_version
  before insert or update on public.plugin_submission_installs
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.plugin_submissions from app_rls;
grant select, insert, update on public.plugin_submissions to app_rls;
revoke all on public.plugin_submission_files from app_rls;
grant select, insert on public.plugin_submission_files to app_rls;
revoke all on public.plugin_submission_installs from app_rls;
grant select, insert, update, delete on public.plugin_submission_installs to app_rls;

alter table public.plugin_submissions enable row level security;
alter table public.plugin_submissions force row level security;
alter table public.plugin_submission_files enable row level security;
alter table public.plugin_submission_files force row level security;
alter table public.plugin_submission_installs enable row level security;
alter table public.plugin_submission_installs force row level security;

drop policy if exists plugin_submissions_owner on public.plugin_submissions;
create policy plugin_submissions_owner
  on public.plugin_submissions for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and status in ('pending', 'withdrawn')
  );

drop policy if exists plugin_submissions_approved_read on public.plugin_submissions;
create policy plugin_submissions_approved_read
  on public.plugin_submissions for select to app_rls
  using (status = 'approved');

drop policy if exists plugin_submission_files_owner on public.plugin_submission_files;
create policy plugin_submission_files_owner
  on public.plugin_submission_files for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and submission_id in (
      select submissions.id
        from public.plugin_submissions submissions
       where submissions.user_id = (select public.current_app_user_id())
    )
  );

drop policy if exists plugin_submission_files_approved_read on public.plugin_submission_files;
create policy plugin_submission_files_approved_read
  on public.plugin_submission_files for select to app_rls
  using (
    exists (
      select 1 from public.plugin_submissions submissions
       where submissions.id = plugin_submission_files.submission_id
         and submissions.status = 'approved'
    )
  );

drop policy if exists plugin_submission_installs_owner on public.plugin_submission_installs;
create policy plugin_submission_installs_owner
  on public.plugin_submission_installs for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.plugin_submissions is
  'A plugin a user submitted to the community directory, one row per submitted version, with its scan result and review state. Approved rows are listed for everyone.';
comment on table public.plugin_submission_files is
  'The files of a submitted plugin as they were when it was submitted.';
comment on table public.plugin_submission_installs is
  'One user''s install of an approved community plugin: its switch and which skills are on (enabled_skills null means all).';

commit;
