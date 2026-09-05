-- 0173 — grant app_rls scoped access to public.mcp_app_payloads and
-- public.mcp_task_bindings.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- 0147 revoked all app_rls privilege on both tables, lumped in with the fully
-- unscoped mcp_response_cache and mcp_discovery_cache caches it created in the
-- same migration. But 0147's own comments describe the opposite of a shared
-- cache for these two: mcp_app_payloads exists so "reads are always bound
-- back to the owning user", and mcp_task_bindings "records who created a
-- handle before allowing later get/update/cancel requests" — both are
-- per-user state, not shared infrastructure, and every statement in
-- lib/connectors/mcp-state-store.ts already carries user_id (see that file's
-- entry in scripts/config/rls-boundary-allowlist.json). The blanket revoke
-- left the scoped role nothing to scope to.
--
-- This migration grants back exactly the operations mcp-state-store.ts's
-- statements use — select and insert on mcp_app_payloads (saveMcpAppPayload,
-- loadMcpAppPayload); select, insert and update on mcp_task_bindings
-- (bindMcpTask's `insert ... on conflict (user_id, connector_id, task_id) do
-- update`, isMcpTaskBound) — and enables row level security so a future move
-- of mcp-state-store.ts onto getUserScopedDb (tracked separately; NOT done by
-- this migration) is scoped by the database, not only by the WHERE clause.
-- mcp_response_cache and mcp_discovery_cache are untouched: they carry no
-- user column and stay owner-only.

grant select, insert on public.mcp_app_payloads to app_rls;
grant select, insert, update on public.mcp_task_bindings to app_rls;

alter table public.mcp_app_payloads enable row level security;
alter table public.mcp_app_payloads force row level security;

drop policy if exists mcp_app_payloads_select_own on public.mcp_app_payloads;
create policy mcp_app_payloads_select_own
  on public.mcp_app_payloads
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists mcp_app_payloads_insert_own on public.mcp_app_payloads;
create policy mcp_app_payloads_insert_own
  on public.mcp_app_payloads
  for insert to app_rls
  with check (user_id = (select public.current_app_user_id()));

alter table public.mcp_task_bindings enable row level security;
alter table public.mcp_task_bindings force row level security;

drop policy if exists mcp_task_bindings_select_own on public.mcp_task_bindings;
create policy mcp_task_bindings_select_own
  on public.mcp_task_bindings
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists mcp_task_bindings_insert_own on public.mcp_task_bindings;
create policy mcp_task_bindings_insert_own
  on public.mcp_task_bindings
  for insert to app_rls
  with check (user_id = (select public.current_app_user_id()));

drop policy if exists mcp_task_bindings_update_own on public.mcp_task_bindings;
create policy mcp_task_bindings_update_own
  on public.mcp_task_bindings
  for update to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.mcp_app_payloads is
  'Opaque MCP tool-result payloads referenced from chat cards. Row level security is enforced: app_rls sees and can insert only the signed-in account''s own rows.';
comment on table public.mcp_task_bindings is
  'Ownership handles for long-running MCP tasks. Row level security is enforced: app_rls sees, inserts and updates only the signed-in account''s own rows.';
