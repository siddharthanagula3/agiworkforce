-- Migration 0024: support_tickets, support_ticket_replies, agent_tools, agent_tool_executions
-- support_tickets was queried in /api/support/route.ts but never migrated.
-- Replies table + agent tool tables are new.

-- ============================================================================
-- Support
-- ============================================================================

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_support_tickets_user
  on public.support_tickets(user_id, created_at desc);

create table if not exists public.support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id text not null,
  message text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_replies_ticket
  on public.support_ticket_replies(ticket_id, created_at asc);

-- ============================================================================
-- Agent tools
-- ============================================================================

create table if not exists public.agent_tools (
  id uuid primary key default gen_random_uuid(),
  user_id text,                     -- null = global/system tool
  name text not null,
  description text not null default '',
  type text not null,               -- 'analysis'|'generation'|'automation'|etc.
  integration_type text not null,   -- 'n8n_workflow'|'anthropic_api'|etc.
  invocation_pattern text not null default '',
  parameters jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_tools_user
  on public.agent_tools(user_id)
  where user_id is not null;

create index if not exists idx_agent_tools_type
  on public.agent_tools(type);

create index if not exists idx_agent_tools_integration_type
  on public.agent_tools(integration_type);

create table if not exists public.agent_tool_executions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.agent_tools(id) on delete cascade,
  user_id text not null,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  success boolean not null default false,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_executions_tool
  on public.agent_tool_executions(tool_id, created_at desc);

create index if not exists idx_tool_executions_user
  on public.agent_tool_executions(user_id, created_at desc);
