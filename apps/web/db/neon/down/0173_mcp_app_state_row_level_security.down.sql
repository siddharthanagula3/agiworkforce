-- Reversal of 0173 — take public.mcp_app_payloads and
-- public.mcp_task_bindings back to owner-only, matching mcp_response_cache
-- and mcp_discovery_cache.
--
-- WHAT THIS COSTS: nothing live. No caller uses app_rls against either table
-- today (lib/connectors/mcp-state-store.ts still runs on the owner
-- connection; its rls-boundary-allowlist.json entry stays accurate after
-- this reversal). This returns exactly to 0147's zero-grant state.

begin;

drop policy if exists mcp_app_payloads_select_own on public.mcp_app_payloads;
drop policy if exists mcp_app_payloads_insert_own on public.mcp_app_payloads;
alter table public.mcp_app_payloads no force row level security;
alter table public.mcp_app_payloads disable row level security;
revoke all on public.mcp_app_payloads from app_rls;

drop policy if exists mcp_task_bindings_select_own on public.mcp_task_bindings;
drop policy if exists mcp_task_bindings_insert_own on public.mcp_task_bindings;
drop policy if exists mcp_task_bindings_update_own on public.mcp_task_bindings;
alter table public.mcp_task_bindings no force row level security;
alter table public.mcp_task_bindings disable row level security;
revoke all on public.mcp_task_bindings from app_rls;

delete from public.schema_migrations
 where filename = '0173_mcp_app_state_row_level_security.sql';

commit;
