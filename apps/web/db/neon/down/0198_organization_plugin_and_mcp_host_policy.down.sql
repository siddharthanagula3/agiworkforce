-- Reversal of 0198: forget workspace plugin and MCP host allowlists.
--
-- WHAT THIS COSTS: every saved plugin approval, plugin block and MCP host
-- allowlist is destroyed, and members can again install any plugin and connect
-- a custom connector to any host. Export the columns first if any are set.

begin;

alter table public.organization_connector_policies
  drop constraint if exists plugin_and_mcp_host_lists_bounded;

alter table public.organization_connector_policies
  drop column if exists allowed_mcp_hosts,
  drop column if exists blocked_plugins,
  drop column if exists allowed_plugins;

delete from public.schema_migrations
 where filename = '0198_organization_plugin_and_mcp_host_policy.sql';

commit;
