-- 0052 — Create user_custom_connectors: user-added remote MCP connectors.
--
-- Claude.ai parity: a signed-in web user can add their OWN remote MCP server
-- (URL + optional bearer token) from Settings > Connectors or the Connectors
-- directory's "Inspect MCP server" flow, have it persist, and have its tools
-- load into chat (lib/user-connector-tools.ts, source #3).
--
-- Unlike `user_connectors` (0048, a per-user ENABLEMENT GATE over
-- operator-configured endpoints), rows here ARE the credential store: each
-- row's url + encrypted bearer token belong to exactly one user and are never
-- shared cross-user (contrast with the operator-mapped remote connector
-- catalog/handle cache, which is intentionally shared because it holds no
-- per-user secrets).
--
-- `short_id`: the chat tool loop namespaces this connector's tools as
-- `mcp__custom-<short_id>__<toolName>` and passes that straight through as
-- the provider-facing function name (lib/user-connector-tools.ts). OpenAI-
-- family providers cap function names at 64 chars, so the full 36-char `id`
-- uuid cannot be used there (it alone would consume 50 of the 64 chars before
-- the tool name even starts). `short_id` is a 10-hex-char (40-bit) app-
-- generated identifier reserved just for that namespace — collision-checked
-- against this user's existing rows at insert time, with this unique
-- constraint as a hard backstop.

create table if not exists public.user_custom_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  url text not null,
  -- Encrypted bearer token (AES-256-GCM, see lib/custom-connector-crypto.ts).
  -- Null when the connector was added without auth.
  auth_header_enc text,
  transport text not null
    check (transport = any (array['sse', 'streamable-http'])),
  short_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_custom_connectors_unique unique (user_id, url),
  constraint user_custom_connectors_short_id_unique unique (user_id, short_id)
);

create index if not exists idx_user_custom_connectors_user_id
  on public.user_custom_connectors(user_id);

alter table public.user_custom_connectors enable row level security;
alter table public.user_custom_connectors force row level security;
drop policy if exists user_custom_connectors_user_isolation on public.user_custom_connectors;
create policy user_custom_connectors_user_isolation
  on public.user_custom_connectors for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
