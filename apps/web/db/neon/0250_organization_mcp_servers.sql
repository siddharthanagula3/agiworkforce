-- =============================================================================
-- Migration 0250: MCP servers an administrator publishes to the whole workspace
--
-- Why    : 0198 lets an administrator say which hosts a MEMBER may point their
--          own custom MCP endpoint at, which is a restriction, not a provision.
--          A workspace that runs its own MCP gateway still had to ask every
--          member to add it by hand, and a member who left took their copy with
--          them. There was no object that says "this server belongs to the
--          workspace", so there was nothing to audit, retire, or hand over.
--
-- Shape  : One row per workspace-published server. `published` is the switch
--          members see: an unpublished row is a draft the administrator is
--          still checking, and retiring a server is an update, never a delete,
--          so the audit trail and the short id survive.
--
-- Empty  : No workspace gains a server from this migration. A workspace with no
--          rows behaves exactly as it did.
--
-- Depends: 0015 (organizations), 0037 (app_rls, current_app_user_id),
--          0141/0144 (governance-table read-only grant convention)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The leading 'p' keeps this out of the 0086 org_short_id namespace
  -- ('^[0-9a-f]{10}$'), so both kinds share one orgmcp- server id space safely.
  short_id text NOT NULL UNIQUE CHECK (short_id ~ '^p[0-9a-f]{10}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 2048),
  transport text NOT NULL CHECK (transport = ANY (ARRAY['sse', 'streamable-http'])),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  retired_at timestamptz,
  created_by_user_id text NOT NULL,
  updated_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_mcp_servers_url_unique UNIQUE (organization_id, url),
  CONSTRAINT organization_mcp_servers_published_at_present
    CHECK (published = false OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS organization_mcp_servers_published_idx
  ON public.organization_mcp_servers (organization_id, name)
  WHERE published AND retired_at IS NULL;

CREATE TRIGGER set_organization_mcp_servers_updated_at
  BEFORE UPDATE ON public.organization_mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Readable by any MEMBER: a published server is part of their connector list,
-- and a member who cannot read the row cannot be told where a tool came from.
-- Writable by nobody through the application role, as 0141 and 0144 set out:
-- publishing goes through the privileged connection in a route that has already
-- checked the administrator's permission.
GRANT SELECT ON public.organization_mcp_servers TO app_rls;
REVOKE INSERT, UPDATE, DELETE ON public.organization_mcp_servers FROM app_rls;

ALTER TABLE public.organization_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_mcp_servers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_mcp_servers_member_read ON public.organization_mcp_servers;
CREATE POLICY organization_mcp_servers_member_read
  ON public.organization_mcp_servers
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_mcp_servers.organization_id
         AND m.user_id = public.current_app_user_id()
    )
  );

COMMENT ON TABLE public.organization_mcp_servers IS
  'MCP servers an administrator publishes to a whole workspace. Every member of the workspace sees a published, unretired row in their connector list without adding it themselves.';
COMMENT ON COLUMN public.organization_mcp_servers.short_id IS
  'Stable suffix of the connector id members see, so a rename never breaks a saved tool permission.';
COMMENT ON COLUMN public.organization_mcp_servers.retired_at IS
  'Set instead of deleting the row: the audit trail and the short id have to outlive the server.';

COMMIT;

-- =============================================================================
-- VERIFICATION: run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. No workspace gains a server from this migration alone:
-- --    SELECT count(*) FROM public.organization_mcp_servers;            -- EXPECT: 0
--
-- -- 2. The application role can read but not write:
-- --    SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
-- --      FROM information_schema.role_table_grants
-- --     WHERE grantee = 'app_rls' AND table_name = 'organization_mcp_servers';
-- --    EXPECT: SELECT
--
-- -- 3. A published row must carry the moment it was published:
-- --    INSERT INTO public.organization_mcp_servers
-- --      (organization_id, short_id, name, url, transport, published,
-- --       created_by_user_id, updated_by_user_id)
-- --    VALUES ('<org>', 'abc123', 'Gateway', 'https://mcp.example.com', 'streamable-http',
-- --            true, 'u', 'u');
-- --    EXPECT: ERROR violates check constraint "organization_mcp_servers_published_at_present"
-- =============================================================================
