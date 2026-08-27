-- Reversal of 0147 — remove the shared stateless MCP caches.
--
-- WHAT THIS COSTS: only cached discovery/catalog/resource responses. Active
-- OAuth grants and connector configuration are untouched; the next request
-- performs discovery again.

begin;

drop index if exists public.mcp_task_bindings_expiry_idx;
drop table if exists public.mcp_task_bindings;
drop index if exists public.mcp_app_payloads_owner_expiry_idx;
drop table if exists public.mcp_app_payloads;
drop index if exists public.mcp_discovery_cache_expiry_idx;
drop table if exists public.mcp_discovery_cache;
drop index if exists public.mcp_response_cache_expiry_idx;
drop table if exists public.mcp_response_cache;
drop sequence if exists public.mcp_response_cache_stamp_seq;

delete from public.schema_migrations
 where filename = '0147_mcp_stateless_cache.sql';

commit;
