-- =============================================================================
-- Migration 0374: per-channel Slack policy, and a monthly credit cap per agent
--
-- Why    : AGI Workforce answered in every Slack channel it was added to, the
--          same way everywhere. Claude in Slack lets an admin attach rules to a
--          workspace or to one channel, and ChatGPT lets admins choose which
--          conversations it serves. Separately, an agent could limit how many
--          messages a person sends it a day, but nothing capped what it spent:
--          Managed Agents cap a session with a hard dollar limit.
--
-- Shape  : slack_channel_policies holds one row per Slack channel the person
--          who installed the app has set: off (it does not answer there),
--          answer (it answers but never starts a task) or task (the default
--          behaviour, kept explicit). A channel without a row behaves as
--          before. Only the installer writes; the installer and linked people
--          read. user_agents gains monthly_credit_limit, and
--          app_user_agent_month_spend returns what an agent has spent this
--          calendar month (UTC) across everyone who uses it, counting its
--          chats and its routines, to anyone who may read the agent; the chat
--          and routine paths refuse a turn once it reaches the limit.
--
-- Depends: 0037 (current_app_user_id), 0076 (set_row_updated_at), 0330 (slack
--          installations), 0370 (user_agents, app_owns_user_agent)
-- =============================================================================

begin;

create table if not exists public.slack_channel_policies (
  installation_id uuid not null references public.slack_installations(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[A-Z0-9]{2,32}$'),
  channel_name text check (channel_name is null or char_length(channel_name) <= 200),
  mode text not null check (mode in ('off', 'answer', 'task')),
  updated_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (installation_id, channel_id)
);

drop trigger if exists set_slack_channel_policies_updated_at on public.slack_channel_policies;
create trigger set_slack_channel_policies_updated_at
  before update on public.slack_channel_policies
  for each row execute function public.set_row_updated_at();

revoke all on public.slack_channel_policies from public, app_rls;
grant select, insert, update, delete on public.slack_channel_policies to app_rls;
alter table public.slack_channel_policies enable row level security;
alter table public.slack_channel_policies force row level security;

drop policy if exists slack_channel_policies_read on public.slack_channel_policies;
create policy slack_channel_policies_read
  on public.slack_channel_policies for select to app_rls
  using (
    exists (
      select 1 from public.slack_installations installation
       where installation.id = slack_channel_policies.installation_id
    )
  );

drop policy if exists slack_channel_policies_installer_write on public.slack_channel_policies;
create policy slack_channel_policies_installer_write
  on public.slack_channel_policies for all to app_rls
  using (
    exists (
      select 1 from public.slack_installations installation
       where installation.id = slack_channel_policies.installation_id
         and installation.installed_by_user_id = (select public.current_app_user_id())
    )
  )
  with check (
    updated_by = (select public.current_app_user_id())
    and exists (
      select 1 from public.slack_installations installation
       where installation.id = slack_channel_policies.installation_id
         and installation.installed_by_user_id = (select public.current_app_user_id())
    )
  );

alter table public.user_agents
  add column if not exists monthly_credit_limit integer
    check (monthly_credit_limit is null or monthly_credit_limit between 1 and 100000000);

create or replace function public.app_user_agent_month_spend(target_agent_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with readable as (
    select agent.id
      from public.user_agents agent
     where agent.id = target_agent_id
       and (
         agent.user_id = public.current_app_user_id()
         or (
           agent.published_version is not null
           and agent.organization_id is not null
           and public.app_org_resource_is_readable(agent.organization_id)
           and (
             agent.visibility = 'workspace'
             or exists (
               select 1 from public.user_agent_access access
                where access.agent_id = agent.id
                  and access.user_id = public.current_app_user_id()
             )
           )
         )
       )
  )
  select coalesce(sum(request.actual_cost_microusd), 0)::bigint
    from public.managed_usage_requests request
    left join public.web_conversations conversation
      on conversation.id = request.conversation_id
    left join public.scheduled_tasks task
      on task.id = request.scheduled_task_id
   where exists (select 1 from readable)
     and request.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
     and request.actual_cost_microusd is not null
     and (conversation.agent_id = target_agent_id or task.agent_id = target_agent_id);
$$;

revoke all on function public.app_user_agent_month_spend(uuid) from public;
grant execute on function public.app_user_agent_month_spend(uuid) to app_rls;

comment on table public.slack_channel_policies is
  'Per-channel Slack behaviour set by the person who installed the app: off, answer only, or tasks.';

commit;
