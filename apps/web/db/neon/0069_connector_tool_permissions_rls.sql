-- 0069 — Row-level security for connector_tool_permissions (AUDIT-FIX CON-4).
--
-- `connector_tool_permissions` (migration 0008) was the ONLY connector table
-- without RLS. Both of its siblings enable + FORCE it with a
-- `current_app_user_id()` policy:
--   * 0048_user_connectors.sql        (lines 27-33)
--   * 0052_user_custom_connectors.sql (lines 45-51)
--
-- Tenant isolation here rested entirely on the route's app-layer
-- `where user_id = $1`, and the route queried through the unscoped, BYPASSRLS
-- `getNeonDb()` connection — so one missing predicate, now or in a future
-- refactor, would read or overwrite another user's allow/deny verdicts. That is
-- a security control, not a preference: flipping a victim's `blocked` row to
-- `always-allow` silently disarms their tool approvals.
--
-- `/api/connectors/permissions` and the server-side reader in
-- `app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` both now
-- run through `getUserScopedDb` (the non-BYPASSRLS `app_rls` role with the
-- verified Clerk subject bound), so this policy is enforceable rather than
-- decorative. Table-level DML grants for `app_rls` were already issued by
-- 0037 (`GRANT ... ON ALL TABLES IN SCHEMA public`), which covers this
-- 0008-era table.
--
-- Idempotent, and shaped exactly like 0048/0052.

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

alter table public.connector_tool_permissions enable row level security;
alter table public.connector_tool_permissions force row level security;
drop policy if exists connector_tool_permissions_user_isolation
  on public.connector_tool_permissions;
create policy connector_tool_permissions_user_isolation
  on public.connector_tool_permissions for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
