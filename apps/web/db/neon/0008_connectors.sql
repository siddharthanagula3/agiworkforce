create table if not exists public.connector_tool_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  connector_id text not null,
  tool_name text not null,
  level text not null default 'needs-approval'
    check (level = any (array['always-allow', 'needs-approval', 'blocked'])),
  destructive boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint connector_tool_permissions_unique unique (user_id, connector_id, tool_name)
);

create index if not exists idx_connector_tool_permissions_user_id
  on public.connector_tool_permissions(user_id);
