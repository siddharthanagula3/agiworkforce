-- =============================================================================
-- Migration 0376: agents a person builds, shares and runs
--
-- Why    : nothing in the product could hold a reusable assistant. ChatGPT
--          lists workspace agents in an Agents sidebar and builds each one
--          with instructions, knowledge, apps and a schedule; Claude defines
--          an agent once with a system prompt, a model, its tools and its MCP
--          servers, and reuses it. A person here could only paste the same
--          instructions into every chat.
--
-- Shape  : user_agents is the working copy of one agent, edited in place and
--          saved as a draft. Publishing freezes the copy into
--          user_agent_versions, one numbered row per publish, and points
--          published_version at it; everyone the agent is shared with runs
--          the published version, and restoring an older one copies it back
--          into the working copy. connector_ids and skill_names of null mean
--          everything the person has, and an empty array means none.
--          visibility is private, people (the workspace members listed in
--          user_agent_access) or workspace (every member of
--          organization_id); sharing needs a workspace. status paused stops
--          the agent until it is resumed; retired keeps the agent and its
--          history read-only. user_agent_files are the reference files the
--          agent reads in every chat, stored as text as user_skill_files are.
--          A conversation or a schedule started as the agent carries its id
--          and keeps it when the agent is deleted, set to null.
--          Ownership moves to another workspace member only through
--          app_transfer_user_agent, and a builder reads usage counts, never
--          another person's chats, through app_user_agent_usage.
--
-- destructive: no row is removed by applying this migration. The only delete is
--          inside app_transfer_user_agent, which drops the new owner's own
--          access row when an agent is handed to them, since an owner needs
--          no grant to their own agent.
--
-- Depends: 0001 (web_conversations, web_messages), 0009 (scheduled_tasks),
--          0015 (organizations, organization_members), 0037 (profiles,
--          current_app_user_id), 0076 (set_row_updated_at, app_has_org_role,
--          current_app_org_id), 0086 (app_org_resource_is_readable),
--          0278 (assign_cloud_sync_version)
-- =============================================================================

begin;

create table if not exists public.user_agents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  icon text not null default 'sparkles' check (icon ~ '^[a-z][a-z0-9-]{0,39}$'),
  accent_color text not null default 'zinc' check (accent_color ~ '^[a-z][a-z0-9-]{0,39}$'),
  instructions text not null default '' check (char_length(instructions) <= 32000),
  output_examples text not null default '' check (char_length(output_examples) <= 8000),
  conversation_starters text[] not null default '{}'::text[]
    check (cardinality(conversation_starters) <= 6),
  model text check (model is null or char_length(model) between 1 and 200),
  web_search boolean not null default true,
  code_execution boolean not null default true,
  image_generation boolean not null default true,
  connector_ids text[] check (connector_ids is null or cardinality(connector_ids) <= 200),
  skill_names text[] check (skill_names is null or cardinality(skill_names) <= 200),
  daily_turn_limit integer check (daily_turn_limit is null or daily_turn_limit between 1 and 10000),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  visibility text not null default 'private' check (visibility in ('private', 'people', 'workspace')),
  published_version integer check (published_version is null or published_version >= 1),
  paused_at timestamptz,
  retired_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint user_agents_shared_needs_workspace
    check (visibility = 'private' or organization_id is not null),
  constraint user_agents_paused_has_date check (status <> 'paused' or paused_at is not null),
  constraint user_agents_retired_has_date check (status <> 'retired' or retired_at is not null)
);

create index if not exists user_agents_owner_idx
  on public.user_agents (user_id, organization_id, updated_at desc);

create index if not exists user_agents_workspace_shared_idx
  on public.user_agents (organization_id, name)
  where visibility <> 'private' and published_version is not null;

drop trigger if exists set_user_agents_updated_at on public.user_agents;
create trigger set_user_agents_updated_at
  before update on public.user_agents
  for each row execute function public.set_row_updated_at();

drop trigger if exists user_agents_assign_version on public.user_agents;
create trigger user_agents_assign_version
  before insert or update on public.user_agents
  for each row execute function public.assign_cloud_sync_version();

create table if not exists public.user_agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  version integer not null check (version >= 1),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  note text check (note is null or char_length(note) <= 300),
  published_by text references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint user_agent_versions_number_unique unique (agent_id, version)
);

create table if not exists public.user_agent_access (
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  granted_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (agent_id, user_id)
);

create index if not exists user_agent_access_user_idx
  on public.user_agent_access (user_id);

create table if not exists public.user_agent_files (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.user_agents(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 200
    and name !~ '[/\\]'
  ),
  mime_type text not null check (char_length(mime_type) between 1 and 200),
  content text not null check (char_length(content) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size = octet_length(content)),
  created_at timestamptz not null default now(),
  constraint user_agent_files_name_unique unique (agent_id, name)
);

create index if not exists user_agent_files_user_idx
  on public.user_agent_files (user_id);

alter table public.web_conversations
  add column if not exists agent_id uuid references public.user_agents(id) on delete set null;

create index if not exists web_conversations_agent_idx
  on public.web_conversations (agent_id, user_id, updated_at desc)
  where agent_id is not null;

alter table public.scheduled_tasks
  add column if not exists agent_id uuid references public.user_agents(id) on delete set null;

create index if not exists scheduled_tasks_agent_idx
  on public.scheduled_tasks (agent_id)
  where agent_id is not null;

create or replace function public.app_owns_user_agent(target_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.user_agents agent
     where agent.id = target_agent_id
       and agent.user_id = public.current_app_user_id()
  );
$$;

revoke all on function public.app_owns_user_agent(uuid) from public;
grant execute on function public.app_owns_user_agent(uuid) to app_rls;

revoke all on public.user_agents from public, app_rls;
grant select, insert, update, delete on public.user_agents to app_rls;
alter table public.user_agents enable row level security;
alter table public.user_agents force row level security;

drop policy if exists user_agents_owner on public.user_agents;
create policy user_agents_owner
  on public.user_agents for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and (
      organization_id is null
      or public.app_org_resource_is_readable(organization_id)
    )
  );

drop policy if exists user_agents_shared_read on public.user_agents;
create policy user_agents_shared_read
  on public.user_agents for select to app_rls
  using (
    published_version is not null
    and status <> 'retired'
    and organization_id is not null
    and organization_id = (select public.current_app_org_id())
    and public.app_org_resource_is_readable(organization_id)
    and (
      visibility = 'workspace'
      or (
        visibility = 'people'
        and exists (
          select 1
            from public.user_agent_access access
           where access.agent_id = user_agents.id
             and access.user_id = (select public.current_app_user_id())
        )
      )
    )
  );

revoke all on public.user_agent_versions from public, app_rls;
grant select, insert on public.user_agent_versions to app_rls;
alter table public.user_agent_versions enable row level security;
alter table public.user_agent_versions force row level security;

drop policy if exists user_agent_versions_read on public.user_agent_versions;
create policy user_agent_versions_read
  on public.user_agent_versions for select to app_rls
  using (
    exists (select 1 from public.user_agents agent where agent.id = user_agent_versions.agent_id)
  );

drop policy if exists user_agent_versions_publish on public.user_agent_versions;
create policy user_agent_versions_publish
  on public.user_agent_versions for insert to app_rls
  with check (
    public.app_owns_user_agent(agent_id)
    and published_by = (select public.current_app_user_id())
  );

revoke all on public.user_agent_access from public, app_rls;
grant select, insert, delete on public.user_agent_access to app_rls;
alter table public.user_agent_access enable row level security;
alter table public.user_agent_access force row level security;

drop policy if exists user_agent_access_read on public.user_agent_access;
create policy user_agent_access_read
  on public.user_agent_access for select to app_rls
  using (
    user_id = (select public.current_app_user_id())
    or public.app_owns_user_agent(agent_id)
  );

drop policy if exists user_agent_access_grant on public.user_agent_access;
create policy user_agent_access_grant
  on public.user_agent_access for insert to app_rls
  with check (
    public.app_owns_user_agent(agent_id)
    and granted_by = (select public.current_app_user_id())
    and exists (
      select 1
        from public.user_agents agent
        join public.organization_members member
          on member.organization_id = agent.organization_id
         and member.user_id = user_agent_access.user_id
       where agent.id = user_agent_access.agent_id
    )
  );

drop policy if exists user_agent_access_revoke on public.user_agent_access;
create policy user_agent_access_revoke
  on public.user_agent_access for delete to app_rls
  using (public.app_owns_user_agent(agent_id));

revoke all on public.user_agent_files from public, app_rls;
grant select, insert, delete on public.user_agent_files to app_rls;
alter table public.user_agent_files enable row level security;
alter table public.user_agent_files force row level security;

drop policy if exists user_agent_files_read on public.user_agent_files;
create policy user_agent_files_read
  on public.user_agent_files for select to app_rls
  using (
    exists (select 1 from public.user_agents agent where agent.id = user_agent_files.agent_id)
  );

drop policy if exists user_agent_files_owner_insert on public.user_agent_files;
create policy user_agent_files_owner_insert
  on public.user_agent_files for insert to app_rls
  with check (
    user_id = (select public.current_app_user_id())
    and public.app_owns_user_agent(agent_id)
  );

drop policy if exists user_agent_files_owner_delete on public.user_agent_files;
create policy user_agent_files_owner_delete
  on public.user_agent_files for delete to app_rls
  using (public.app_owns_user_agent(agent_id));

create or replace function public.app_transfer_user_agent(
  target_agent_id uuid,
  new_owner_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  agent_org uuid;
begin
  select agent.organization_id
    into agent_org
    from public.user_agents agent
   where agent.id = target_agent_id
     and agent.user_id = public.current_app_user_id()
   for update;
  if agent_org is null then
    return false;
  end if;
  if new_owner_id = public.current_app_user_id() then
    return false;
  end if;
  if not exists (
    select 1
      from public.organization_members member
     where member.organization_id = agent_org
       and member.user_id = new_owner_id
  ) then
    return false;
  end if;
  update public.user_agents
     set user_id = new_owner_id
   where id = target_agent_id;
  delete from public.user_agent_access
   where agent_id = target_agent_id
     and user_id = new_owner_id;
  update public.user_agent_files
     set user_id = new_owner_id
   where agent_id = target_agent_id;
  return true;
end;
$$;

revoke all on function public.app_transfer_user_agent(uuid, text) from public;
grant execute on function public.app_transfer_user_agent(uuid, text) to app_rls;

create or replace function public.app_user_agent_usage(
  target_agent_id uuid,
  since timestamptz
)
returns table (conversations bigint, people bigint, turns bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct conversation.id)::bigint,
         count(distinct conversation.user_id)::bigint,
         count(message.id)::bigint
    from public.web_conversations conversation
    left join public.web_messages message
      on message.conversation_id = conversation.id
     and message.role = 'user'
     and message.created_at >= since
   where public.app_owns_user_agent(target_agent_id)
     and conversation.agent_id = target_agent_id
     and conversation.deleted_at is null
     and conversation.updated_at >= since;
$$;

revoke all on function public.app_user_agent_usage(uuid, timestamptz) from public;
grant execute on function public.app_user_agent_usage(uuid, timestamptz) to app_rls;

comment on table public.user_agents is
  'Agents a person builds: the working copy of name, look, instructions, model, tools, connectors, skills, budget, status and sharing. Published copies live in user_agent_versions.';
comment on table public.user_agent_versions is
  'Each published copy of an agent, numbered from 1. Shared people run the one user_agents.published_version names; restoring copies one back into the working copy.';
comment on table public.user_agent_access is
  'Workspace members an agent with visibility people is shared with.';
comment on table public.user_agent_files is
  'Reference files an agent reads in every chat, stored as extracted text.';

commit;
