-- Depends: 0001, 0002, 0037, 0050, 0110
begin;

create table public.connector_tool_session_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.web_conversations(id) on delete cascade,
  connector_id text not null check (char_length(connector_id) between 1 and 200),
  tool_name text not null check (char_length(tool_name) between 1 and 200),
  trust_boundary text not null check (trust_boundary in ('local', 'byok', 'managed')),
  destructive boolean not null,
  risk_tier text not null check (risk_tier in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz not null default now(),
  constraint connector_tool_session_grants_scope_key
    unique (user_id, conversation_id, connector_id, tool_name, trust_boundary)
);

create index connector_tool_session_grants_conversation
  on public.connector_tool_session_grants (user_id, conversation_id, trust_boundary);

revoke all on public.connector_tool_session_grants from public, app_rls;
grant select, insert, delete on public.connector_tool_session_grants to app_rls;
alter table public.connector_tool_session_grants enable row level security;
alter table public.connector_tool_session_grants force row level security;

create policy connector_tool_session_grants_read
  on public.connector_tool_session_grants for select to app_rls
  using (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.web_conversations conversation
       where conversation.id = connector_tool_session_grants.conversation_id
         and conversation.user_id = connector_tool_session_grants.user_id
         and conversation.organization_id is not distinct from (select public.current_app_org_id())
    )
  );

create policy connector_tool_session_grants_insert
  on public.connector_tool_session_grants for insert to app_rls
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.web_conversations conversation
       where conversation.id = connector_tool_session_grants.conversation_id
         and conversation.user_id = connector_tool_session_grants.user_id
         and conversation.organization_id is not distinct from (select public.current_app_org_id())
         and conversation.deleted_at is null
         and conversation.is_temporary = false
    )
  );

create policy connector_tool_session_grants_delete
  on public.connector_tool_session_grants for delete to app_rls
  using (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.web_conversations conversation
       where conversation.id = connector_tool_session_grants.conversation_id
         and conversation.user_id = connector_tool_session_grants.user_id
         and conversation.organization_id is not distinct from (select public.current_app_org_id())
    )
  );

comment on table public.connector_tool_session_grants is
  'Revocable connector approvals for one saved conversation and trust boundary. Deleting the conversation removes its grants; workspace restrictions and current tool risk still apply.';

commit;
