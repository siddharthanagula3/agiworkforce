-- =============================================================================
-- Migration 0326: a workspace's private plugin marketplace
--
-- Why    : an administrator could only approve or block plugins from the
--          shared catalogue; a workspace could not offer its own plugins to
--          its members. Claude Team and Enterprise let owners add plugins
--          and skills that every member then finds under Customize.
--
-- Shape  : organization_plugins holds each plugin a workspace publishes, one
--          row per plugin key, replaced in place when it is published again
--          and retired rather than deleted so the history outlives it. The
--          row belongs to the workspace, not to the administrator who
--          published it, so published_by is cleared when that account is
--          erased and the plugin stays. install_preference is Claude's four
--          settings: required (on for everyone, cannot be turned off),
--          installed_by_default (on for everyone, each member may turn it
--          off), available (listed, each member adds it) and not_available
--          (hidden). organization_plugin_files holds its files, as
--          plugin_marketplace_entry_files does for an upload.
--          organization_plugin_members is one member's own state for one
--          plugin: added from the workspace marketplace, turned off, or with
--          some of its skills off. Members read their workspace's rows;
--          every write goes through the service connection behind a
--          workspace permission check, as organization_mcp_servers does.
--
-- Depends: 0015 (organizations, organization_members), 0037 (profiles,
--          current_app_user_id), 0076 (set_row_updated_at), 0278
--          (assign_cloud_sync_version)
-- =============================================================================

begin;

create table if not exists public.organization_plugins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plugin_key text not null check (plugin_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 2000),
  version text not null check (char_length(version) between 1 and 64),
  skills jsonb not null default '[]'::jsonb check (jsonb_typeof(skills) = 'array'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  scan_verdict text not null check (scan_verdict in ('pass', 'review')),
  scan_findings jsonb not null default '[]'::jsonb check (jsonb_typeof(scan_findings) = 'array'),
  status text not null default 'published' check (status in ('published', 'retired')),
  install_preference text not null default 'available' check (
    install_preference in ('required', 'installed_by_default', 'available', 'not_available')
  ),
  published_by text references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint organization_plugins_key_unique unique (organization_id, plugin_key),
  constraint organization_plugins_retired_has_date check (status <> 'retired' or retired_at is not null)
);

create index if not exists organization_plugins_published_idx
  on public.organization_plugins (organization_id, name)
  where status = 'published';

drop trigger if exists set_organization_plugins_updated_at on public.organization_plugins;
create trigger set_organization_plugins_updated_at
  before update on public.organization_plugins
  for each row execute function public.set_row_updated_at();

drop trigger if exists organization_plugins_assign_version on public.organization_plugins;
create trigger organization_plugins_assign_version
  before insert or update on public.organization_plugins
  for each row execute function public.assign_cloud_sync_version();

create table if not exists public.organization_plugin_files (
  id uuid primary key default gen_random_uuid(),
  plugin_id uuid not null references public.organization_plugins(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
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
  constraint organization_plugin_files_path_unique unique (plugin_id, path)
);

create index if not exists organization_plugin_files_org_idx
  on public.organization_plugin_files (organization_id);

drop trigger if exists set_organization_plugin_files_updated_at on public.organization_plugin_files;
create trigger set_organization_plugin_files_updated_at
  before update on public.organization_plugin_files
  for each row execute function public.set_row_updated_at();

drop trigger if exists organization_plugin_files_assign_version on public.organization_plugin_files;
create trigger organization_plugin_files_assign_version
  before insert or update on public.organization_plugin_files
  for each row execute function public.assign_cloud_sync_version();

create table if not exists public.organization_plugin_members (
  plugin_id uuid not null references public.organization_plugins(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  installed boolean not null default false,
  enabled boolean not null default true,
  enabled_skills jsonb check (enabled_skills is null or jsonb_typeof(enabled_skills) = 'array'),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  primary key (plugin_id, user_id)
);

create index if not exists organization_plugin_members_user_idx
  on public.organization_plugin_members (user_id, organization_id);

drop trigger if exists set_organization_plugin_members_updated_at on public.organization_plugin_members;
create trigger set_organization_plugin_members_updated_at
  before update on public.organization_plugin_members
  for each row execute function public.set_row_updated_at();

drop trigger if exists organization_plugin_members_assign_version on public.organization_plugin_members;
create trigger organization_plugin_members_assign_version
  before insert or update on public.organization_plugin_members
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.organization_plugins from app_rls;
grant select on public.organization_plugins to app_rls;
revoke all on public.organization_plugin_files from app_rls;
grant select on public.organization_plugin_files to app_rls;
revoke all on public.organization_plugin_members from app_rls;
grant select, insert, update, delete on public.organization_plugin_members to app_rls;

alter table public.organization_plugins enable row level security;
alter table public.organization_plugins force row level security;
alter table public.organization_plugin_files enable row level security;
alter table public.organization_plugin_files force row level security;
alter table public.organization_plugin_members enable row level security;
alter table public.organization_plugin_members force row level security;

drop policy if exists organization_plugins_member_read on public.organization_plugins;
create policy organization_plugins_member_read
  on public.organization_plugins for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_plugins.organization_id
         and m.user_id = (select public.current_app_user_id())
    )
  );

drop policy if exists organization_plugin_files_member_read on public.organization_plugin_files;
create policy organization_plugin_files_member_read
  on public.organization_plugin_files for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_plugin_files.organization_id
         and m.user_id = (select public.current_app_user_id())
    )
  );

drop policy if exists organization_plugin_members_owner on public.organization_plugin_members;
create policy organization_plugin_members_owner
  on public.organization_plugin_members for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.organization_members m
       where m.organization_id = organization_plugin_members.organization_id
         and m.user_id = (select public.current_app_user_id())
    )
  );

comment on table public.organization_plugins is
  'Plugins a workspace publishes to its own members: its private marketplace. The row belongs to the workspace, survives the publisher, and is retired rather than deleted.';
comment on table public.organization_plugin_files is
  'The files of a workspace plugin: each skill''s SKILL.md and the text files it bundles.';
comment on table public.organization_plugin_members is
  'One member''s own state for one workspace plugin: added from the workspace marketplace, turned off, or with some skills off (enabled_skills null means all).';

commit;
