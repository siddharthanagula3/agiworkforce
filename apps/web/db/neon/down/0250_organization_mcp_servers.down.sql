-- Reversal of 0250 : remove workspace-published MCP servers.
--
-- WHAT THIS COSTS: every workspace-published server disappears from every
-- member's connector list, and the record of who published it and when is gone
-- with it. Member-owned custom connectors (user_custom_connectors) and the host
-- allowlist from 0198 are untouched, so a member who also added the same server
-- themselves keeps their own copy.

BEGIN;

DROP POLICY IF EXISTS organization_mcp_servers_member_read ON public.organization_mcp_servers;
DROP TRIGGER IF EXISTS set_organization_mcp_servers_updated_at ON public.organization_mcp_servers;
DROP INDEX IF EXISTS public.organization_mcp_servers_published_idx;
DROP TABLE IF EXISTS public.organization_mcp_servers;

DELETE FROM public.schema_migrations
 WHERE filename = '0250_organization_mcp_servers.sql';

COMMIT;
