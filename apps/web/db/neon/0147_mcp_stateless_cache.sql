-- 0147 — shared caches for stateless MCP 2026-07-28 clients.
--
-- The official SDK owns cache keys, freshness and private/public scope. These
-- tables only persist the SDK's opaque values so serverless requests can reuse
-- discovery and cacheable catalogs without retaining an MCP session or client
-- object in process memory.

create sequence if not exists public.mcp_response_cache_stamp_seq;

create table if not exists public.mcp_response_cache (
  method text not null,
  params_key text not null default '',
  partition_key text not null default '',
  value text not null,
  stamp bigint not null default nextval('public.mcp_response_cache_stamp_seq'),
  expires_at_ms bigint,
  scope text check (scope is null or scope = any (array['public', 'private'])),
  updated_at timestamptz not null default now(),
  primary key (method, params_key, partition_key)
);

create index if not exists mcp_response_cache_expiry_idx
  on public.mcp_response_cache (expires_at_ms)
  where expires_at_ms is not null;

create table if not exists public.mcp_discovery_cache (
  server_key text not null check (server_key ~ '^[0-9a-f]{64}$'),
  authorization_context_key text not null
    check (authorization_context_key ~ '^[0-9a-f]{64}$'),
  discover_result jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (server_key, authorization_context_key)
);

create index if not exists mcp_discovery_cache_expiry_idx
  on public.mcp_discovery_cache (expires_at);

-- App payloads are kept out of chat-card metadata so a large structured tool
-- result cannot exceed the Generative UI event limit. The card carries only
-- this opaque id; reads are always bound back to the owning user.
create table if not exists public.mcp_app_payloads (
  id text primary key,
  user_id text not null,
  connector_id text not null,
  resource_uri text not null,
  tool_name text not null,
  tool_input jsonb not null,
  tool_result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mcp_app_payloads_owner_expiry_idx
  on public.mcp_app_payloads (user_id, expires_at);

-- Tasks are server-owned and opaque, but the host still records who created a
-- handle before allowing later get/update/cancel requests through a shared
-- connector credential.
create table if not exists public.mcp_task_bindings (
  user_id text not null,
  connector_id text not null,
  task_id text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, connector_id, task_id)
);

create index if not exists mcp_task_bindings_expiry_idx
  on public.mcp_task_bindings (expires_at)
  where expires_at is not null;

-- These are infrastructure caches reached only through the privileged server
-- connection. The app_rls role inherits broad defaults from migration 0037;
-- remove them explicitly so no user-scoped SQL context can inspect or poison
-- another authorization partition.
revoke all on table public.mcp_response_cache from app_rls;
revoke all on table public.mcp_discovery_cache from app_rls;
revoke all on table public.mcp_app_payloads from app_rls;
revoke all on table public.mcp_task_bindings from app_rls;
revoke all on sequence public.mcp_response_cache_stamp_seq from app_rls;
