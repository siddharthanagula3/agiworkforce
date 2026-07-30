-- Canonical schema for the gateway relations that predate the web_* tables.
--
-- These names remain distinct because their request/response contracts differ,
-- but they are no longer an unowned "shadow schema": every table is migrated,
-- indexed, and protected by the same app_rls subject used by gateway requests.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text,
  model text,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_user_updated
  on public.conversations (user_id, updated_at desc)
  where is_deleted = false;

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_row_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  model text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at asc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  desktop_id uuid,
  conversation_id uuid,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  source text not null default 'mobile',
  model text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_user_created
  on public.chat_messages (user_id, created_at desc);
create index if not exists idx_chat_messages_user_conversation_created
  on public.chat_messages (user_id, conversation_id, created_at desc)
  where conversation_id is not null;
create index if not exists idx_chat_messages_user_desktop_created
  on public.chat_messages (user_id, desktop_id, created_at desc)
  where desktop_id is not null;

create table if not exists public.device_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id text not null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'revoked', 'expired')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, device_id)
);

create index if not exists idx_device_pairings_user_status
  on public.device_pairings (user_id, status);

drop trigger if exists set_device_pairings_updated_at on public.device_pairings;
create trigger set_device_pairings_updated_at
  before update on public.device_pairings
  for each row execute function public.set_row_updated_at();

create table if not exists public.agent_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  desktop_id uuid not null,
  agent_id text,
  tool_name text not null,
  tool_args jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled')),
  denial_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_agent_approval_requests_user_status_created
  on public.agent_approval_requests (user_id, status, created_at desc);
create index if not exists idx_agent_approval_requests_desktop_status_created
  on public.agent_approval_requests (desktop_id, status, created_at desc);

grant select, insert, update, delete on
  public.conversations,
  public.messages,
  public.chat_messages,
  public.device_pairings,
  public.agent_approval_requests
to app_rls;

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
create policy conversations_user_isolation
  on public.conversations for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

alter table public.messages enable row level security;
alter table public.messages force row level security;
create policy messages_conversation_isolation
  on public.messages for all to app_rls
  using (
    exists (
      select 1
        from public.conversations as parent
       where parent.id = messages.conversation_id
         and parent.user_id = public.current_app_user_id()
    )
  )
  with check (
    exists (
      select 1
        from public.conversations as parent
       where parent.id = messages.conversation_id
         and parent.user_id = public.current_app_user_id()
    )
  );

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;
create policy chat_messages_user_isolation
  on public.chat_messages for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

alter table public.device_pairings enable row level security;
alter table public.device_pairings force row level security;
create policy device_pairings_user_isolation
  on public.device_pairings for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

alter table public.agent_approval_requests enable row level security;
alter table public.agent_approval_requests force row level security;
create policy agent_approval_requests_user_isolation
  on public.agent_approval_requests for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
