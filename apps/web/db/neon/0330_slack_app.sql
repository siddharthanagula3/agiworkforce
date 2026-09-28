-- =============================================================================
-- Migration 0330: the AGI Workforce app in Slack
--
-- Why    : a Slack event could only start a saved routine, nothing answered in
--          Slack, and the product's own Slack app had no install path. Claude
--          in Slack is installed once per Slack workspace, each person links
--          their own account, and it answers direct messages and mentions in
--          the thread as the app, on that person's plan and settings.
--
-- Shape  : slack_installations holds one row per Slack workspace the app is
--          installed in: its bot identity, the bot token sealed by the
--          connector key ring, and the account that installed it, which is the
--          one that may remove it. slack_link_requests holds the single link a
--          person who is not linked yet is sent in Slack, as a SHA-256 of its
--          token, until it is used or expires. slack_account_links binds one
--          Slack user in one installation to one account and the workspace it
--          acts in. slack_assistant_runs records each message the app took up
--          for a linked account, deduplicated on the installation and Slack's
--          event id, and holds the tool loop checkpoint while a step waits for
--          the account's approval on web or desktop. Removing the app from a
--          Slack workspace deletes its installation, and with it every link,
--          pending link and run that belongs to it.
--
-- Depends: 0015 (organizations), 0037 (profiles, current_app_user_id),
--          0061 (cloud_agent_runs), 0076 (set_row_updated_at),
--          0110 (app_row_is_writable)
-- =============================================================================

begin;

create table if not exists public.slack_installations (
  id uuid primary key default gen_random_uuid(),
  team_id text not null unique check (team_id ~ '^[A-Z0-9]{2,32}$'),
  team_name text not null check (char_length(team_name) between 1 and 200),
  enterprise_id text check (enterprise_id is null or enterprise_id ~ '^[A-Z0-9]{2,32}$'),
  app_id text not null check (app_id ~ '^[A-Z0-9]{2,32}$'),
  bot_user_id text not null check (bot_user_id ~ '^[A-Z0-9]{2,32}$'),
  bot_scopes text[] not null default '{}'::text[] check (cardinality(bot_scopes) <= 50),
  bot_token_enc text not null check (char_length(bot_token_enc) between 1 and 4096),
  installed_by_user_id text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_slack_installations_updated_at on public.slack_installations;
create trigger set_slack_installations_updated_at
  before update on public.slack_installations
  for each row execute function public.set_row_updated_at();

create index if not exists idx_slack_installations_installed_by
  on public.slack_installations (installed_by_user_id, created_at desc)
  where installed_by_user_id is not null;

revoke all on public.slack_installations from app_rls;
grant select (
  id, team_id, team_name, enterprise_id, app_id, bot_user_id, bot_scopes,
  installed_by_user_id, created_at, updated_at
) on public.slack_installations to app_rls;

alter table public.slack_installations enable row level security;
alter table public.slack_installations force row level security;

create table if not exists public.slack_link_requests (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.slack_installations(id) on delete cascade,
  slack_user_id text not null check (slack_user_id ~ '^[A-Z0-9]{2,32}$'),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  last_event_id text not null check (char_length(last_event_id) between 1 and 128),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint slack_link_requests_one_per_user unique (installation_id, slack_user_id)
);

create index if not exists idx_slack_link_requests_expires
  on public.slack_link_requests (expires_at);

revoke all on public.slack_link_requests from app_rls;

alter table public.slack_link_requests enable row level security;
alter table public.slack_link_requests force row level security;

create table if not exists public.slack_account_links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  installation_id uuid not null references public.slack_installations(id) on delete cascade,
  slack_user_id text not null check (slack_user_id ~ '^[A-Z0-9]{2,32}$'),
  slack_user_name text check (slack_user_name is null or char_length(slack_user_name) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slack_account_links_one_per_slack_user unique (installation_id, slack_user_id)
);

drop trigger if exists set_slack_account_links_updated_at on public.slack_account_links;
create trigger set_slack_account_links_updated_at
  before update on public.slack_account_links
  for each row execute function public.set_row_updated_at();

create index if not exists idx_slack_account_links_user
  on public.slack_account_links (user_id, created_at desc);

create index if not exists idx_slack_account_links_organization
  on public.slack_account_links (organization_id)
  where organization_id is not null;

revoke all on public.slack_account_links from app_rls;
grant select, insert, delete on public.slack_account_links to app_rls;

alter table public.slack_account_links enable row level security;
alter table public.slack_account_links force row level security;

drop policy if exists slack_account_links_owner_read on public.slack_account_links;
create policy slack_account_links_owner_read
  on public.slack_account_links for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists slack_account_links_owner_insert on public.slack_account_links;
create policy slack_account_links_owner_insert
  on public.slack_account_links for insert to app_rls
  with check (public.app_row_is_writable(user_id, organization_id));

drop policy if exists slack_account_links_owner_delete on public.slack_account_links;
create policy slack_account_links_owner_delete
  on public.slack_account_links for delete to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists slack_installations_installer_or_linked_read on public.slack_installations;
create policy slack_installations_installer_or_linked_read
  on public.slack_installations for select to app_rls
  using (
    installed_by_user_id = (select public.current_app_user_id())
    or exists (
      select 1
        from public.slack_account_links as link
       where link.installation_id = slack_installations.id
         and link.user_id = (select public.current_app_user_id())
    )
  );

create table if not exists public.slack_assistant_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  installation_id uuid not null references public.slack_installations(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 128),
  slack_user_id text not null check (slack_user_id ~ '^[A-Z0-9]{2,32}$'),
  channel_id text not null check (channel_id ~ '^[A-Z0-9]{2,32}$'),
  message_ts text not null check (message_ts ~ '^[0-9]{1,20}\.[0-9]{1,10}$'),
  thread_ts text check (thread_ts is null or thread_ts ~ '^[0-9]{1,20}\.[0-9]{1,10}$'),
  surface text not null check (surface = any (array['direct_message', 'channel'])),
  mode text not null default 'answer' check (mode = any (array['answer', 'task'])),
  status text not null default 'running'
    check (
      status = any (array['running', 'awaiting_approval', 'completed', 'failed', 'expired', 'cancelled'])
    ),
  model text check (model is null or char_length(model) between 1 and 200),
  agent_run_id uuid references public.cloud_agent_runs(id) on delete set null,
  approval_checkpoint jsonb
    check (approval_checkpoint is null or jsonb_typeof(approval_checkpoint) = 'object'),
  approval_request jsonb
    check (approval_request is null or jsonb_typeof(approval_request) = 'object'),
  approval_expires_at timestamptz,
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint slack_assistant_runs_event_unique unique (installation_id, event_id),
  constraint slack_assistant_runs_approval_complete
    check (
      status <> 'awaiting_approval'
      or (
        approval_checkpoint is not null
        and approval_request is not null
        and approval_expires_at is not null
      )
    )
);

drop trigger if exists set_slack_assistant_runs_updated_at on public.slack_assistant_runs;
create trigger set_slack_assistant_runs_updated_at
  before update on public.slack_assistant_runs
  for each row execute function public.set_row_updated_at();

create index if not exists idx_slack_assistant_runs_user
  on public.slack_assistant_runs (user_id, created_at desc);

create index if not exists idx_slack_assistant_runs_awaiting
  on public.slack_assistant_runs (user_id, approval_expires_at)
  where status = 'awaiting_approval';

create index if not exists idx_slack_assistant_runs_organization
  on public.slack_assistant_runs (organization_id)
  where organization_id is not null;

create index if not exists idx_slack_assistant_runs_agent_run
  on public.slack_assistant_runs (agent_run_id)
  where agent_run_id is not null;

revoke all on public.slack_assistant_runs from app_rls;
grant select, insert, delete on public.slack_assistant_runs to app_rls;
grant update (
  status, model, agent_run_id, approval_checkpoint, approval_request, approval_expires_at,
  error, completed_at, updated_at
) on public.slack_assistant_runs to app_rls;

alter table public.slack_assistant_runs enable row level security;
alter table public.slack_assistant_runs force row level security;

drop policy if exists slack_assistant_runs_owner_read on public.slack_assistant_runs;
create policy slack_assistant_runs_owner_read
  on public.slack_assistant_runs for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists slack_assistant_runs_owner_insert on public.slack_assistant_runs;
create policy slack_assistant_runs_owner_insert
  on public.slack_assistant_runs for insert to app_rls
  with check (public.app_row_is_writable(user_id, organization_id));

drop policy if exists slack_assistant_runs_owner_update on public.slack_assistant_runs;
create policy slack_assistant_runs_owner_update
  on public.slack_assistant_runs for update to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

drop policy if exists slack_assistant_runs_owner_delete on public.slack_assistant_runs;
create policy slack_assistant_runs_owner_delete
  on public.slack_assistant_runs for delete to app_rls
  using (user_id = (select public.current_app_user_id()));

comment on table public.slack_installations is
  'One row per Slack workspace the AGI Workforce app is installed in. The bot token is sealed and readable only by the service role; the installing account may list and remove it.';
comment on table public.slack_link_requests is
  'The single pending link a Slack user who is not linked yet was sent, stored as a SHA-256 of its token, until it is used or expires.';
comment on table public.slack_account_links is
  'A Slack user in one installation bound to one account and the workspace it acts in. The app answers that Slack user only through this link.';
comment on table public.slack_assistant_runs is
  'Each Slack message the app took up for a linked account, deduplicated on the installation and event id, with the tool loop checkpoint while a step waits for approval.';

commit;
