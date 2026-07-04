-- 0048 — Create user_connectors (missing migration; connectors API 503s without it).
--
-- apps/web/app/api/connectors/route.ts has queried/written `user_connectors`
-- since it was added, but no migration ever created the table. Every request
-- hit PG error 42P01 (undefined_table), which the route already handles
-- gracefully (GET returns an empty list, POST/DELETE return 503), so the tab
-- silently looked broken in every environment instead of erroring loudly.
--
-- Columns match the route's SELECT/INSERT/UPDATE exactly:
--   id, connector_id, auth_type, connected_at, updated_at, is_active, user_id.

create table if not exists public.user_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  connector_id text not null,
  auth_type text not null
    check (auth_type = any (array['local', 'oauth', 'api_key', 'connection_string', 'pat'])),
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connectors_unique unique (user_id, connector_id)
);

create index if not exists idx_user_connectors_user_id
  on public.user_connectors(user_id) where is_active = true;

alter table public.user_connectors enable row level security;
alter table public.user_connectors force row level security;
drop policy if exists user_connectors_user_isolation on public.user_connectors;
create policy user_connectors_user_isolation
  on public.user_connectors for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
