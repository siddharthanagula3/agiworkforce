-- =============================================================================
-- Migration 0198: workspace allowlists for plugins and MCP endpoint hosts
--
-- Why    : 0141 lets an administrator decide which connectors members use, but
--          a plugin install never asked it, and the only control over a custom
--          MCP endpoint was an on/off switch. An organization that permits
--          custom connectors to its own MCP gateway had to permit every host.
--
-- Shape  : Two plugin lists with the same precedence as the connector lists,
--          and one host allowlist for member-supplied MCP endpoints. A host
--          entry is an exact hostname or a "*.domain" suffix.
--
-- Empty  : AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL, as in 0141.
--          Existing rows gain empty lists and keep their current behaviour.
--
-- Depends: 0141 (organization_connector_policies), 0144 (governance writes)
-- =============================================================================

BEGIN;

ALTER TABLE public.organization_connector_policies
  ADD COLUMN IF NOT EXISTS allowed_plugins text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS blocked_plugins text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS allowed_mcp_hosts text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.organization_connector_policies
  DROP CONSTRAINT IF EXISTS plugin_and_mcp_host_lists_bounded;
ALTER TABLE public.organization_connector_policies
  ADD CONSTRAINT plugin_and_mcp_host_lists_bounded CHECK (
    cardinality(allowed_plugins) <= 512
    AND cardinality(blocked_plugins) <= 512
    AND cardinality(allowed_mcp_hosts) <= 512
  );

COMMENT ON COLUMN public.organization_connector_policies.allowed_plugins IS
  'Plugin keys members may install. Empty means unrestricted.';
COMMENT ON COLUMN public.organization_connector_policies.blocked_plugins IS
  'Plugin keys members may not install. A block wins over an allow.';
COMMENT ON COLUMN public.organization_connector_policies.allowed_mcp_hosts IS
  'Hostnames (exact or *.suffix) a member-supplied MCP endpoint may connect to. Empty means unrestricted.';

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. No workspace gains a restriction from this migration alone:
-- --    SELECT count(*) FROM public.organization_connector_policies
-- --     WHERE cardinality(allowed_plugins) + cardinality(blocked_plugins)
-- --           + cardinality(allowed_mcp_hosts) > 0;              -- EXPECT: 0
--
-- -- 2. The application role still cannot write (0144):
-- --    SET ROLE app_rls;
-- --    UPDATE public.organization_connector_policies SET allowed_plugins = '{x}';
-- --    EXPECT: ERROR permission denied
-- =============================================================================
