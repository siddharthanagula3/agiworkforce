-- =============================================================================
-- Migration 0073: tenancy foundation — organization-scoped content + admin read
--
-- Why    : Every enterprise capability the product needs to sell (admin
--          visibility, retention, legal hold, residency, org deletion, org
--          budgets) is blocked on one missing fact: whether a row belongs to a
--          person or to a workspace. Today every content table is scoped by
--          `user_id` alone, so an org admin has no lawful path to their own
--          workspace's data and an org has no lifecycle boundary.
--
-- Model  : `organization_id` is NULLABLE and NULL means PERSONAL. No backfill.
--          Every existing row stays personal and keeps exactly today's
--          visibility, so this migration is behaviour-preserving on apply.
--          A non-null value means the row is workspace-owned; the owner still
--          sees it, and org owners/admins additionally see it when it belongs
--          to their ACTIVE organization. This mirrors ChatGPT Enterprise and
--          Claude for Work: personal stays personal, workspace work is
--          governable.
--
-- Fails  : `current_app_org_id()` returns NULL when the GUC is unset, so every
-- closed   org branch evaluates to NULL -> not-true -> deny. An unset org
--          context can only ever see personal rows, never more. WITH CHECK
--          additionally refuses to let a caller file a row into an
--          organization they are not a member of, so tenancy cannot be forged
--          from the client.
--
-- Also   : `media_assets` is the ONLY user-owned content table that never had
--          RLS enabled (0036 created it; 0037/0054 never covered it). Access is
--          correctly filtered in application code today (verified: every read
--          in lib/server/media-assets.ts binds `user_id`, and both
--          `getMediaAssetById` callers check ownership explicitly — PER-27), so
--          this is defence-in-depth, not an open hole. It is closed here because
--          a single future query that forgets the predicate currently has no
--          backstop at all.
--
-- Depends: 0015_organizations (organizations, organization_members)
--          0037_rls_user_isolation (current_app_user_id, app_rls role)
--          0054_gateway_user_scope_rls (gateway isolation shape)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_app_org_id()
-- The ACTIVE organization for this request, injected by the application layer
-- alongside the subject via `SET LOCAL request.jwt.claim.org_id`. NULL when
-- unset or blank, so every comparison below fails closed exactly like
-- current_app_user_id().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.org_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Helper: current_app_org_role()
-- The caller's role in the ACTIVE organization, or NULL when there is no active
-- org or no membership row. Membership is read from the table, never from a
-- client-supplied claim, so a forged JWT claim cannot grant admin.
--
-- SECURITY DEFINER: organization_members is itself under RLS with a self-read
-- policy (0054), which would otherwise hide the very row this lookup needs when
-- evaluating another table's policy. The function is owned by the migration
-- role, takes no arguments, and has a pinned search_path, so it exposes nothing
-- beyond the caller's own membership role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role
    FROM public.organization_members m
   WHERE m.organization_id = public.current_app_org_id()
     AND m.user_id = public.current_app_user_id()
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_org_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_org_role() TO app_rls;
GRANT EXECUTE ON FUNCTION public.current_app_org_id() TO app_rls;

-- ---------------------------------------------------------------------------
-- Helper: app_row_is_visible(owner_id, org_id)
-- The single tenancy predicate. Defined once so all 12 policies below cannot
-- drift apart, and so a future change to the visibility rule is one edit rather
-- than twelve.
--   * the owner always sees their own row
--   * an org owner/admin sees rows filed to their ACTIVE organization
-- Anything else is denied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_row_is_visible(row_user_id text, row_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT row_user_id = public.current_app_user_id()
      OR (
        row_org_id IS NOT NULL
        AND row_org_id = public.current_app_org_id()
        AND public.current_app_org_role() IN ('owner', 'admin')
      );
$$;

-- ---------------------------------------------------------------------------
-- Helper: app_row_is_writable(owner_id, org_id)
-- WITH CHECK counterpart. A caller may only write a row they own, and may only
-- file it into an organization they are actually a member of — membership read
-- from the table, so `organization_id` cannot be forged from the client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_row_is_writable(row_user_id text, row_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT row_user_id = public.current_app_user_id()
     AND (
       row_org_id IS NULL
       OR (
         row_org_id = public.current_app_org_id()
         AND public.current_app_org_role() IS NOT NULL
       )
     );
$$;

GRANT EXECUTE ON FUNCTION public.app_row_is_visible(text, uuid) TO app_rls;
GRANT EXECUTE ON FUNCTION public.app_row_is_writable(text, uuid) TO app_rls;

-- ---------------------------------------------------------------------------
-- Tenancy column on the content roots.
-- Child tables (web_messages, web_artifact_versions, scheduled_task_runs,
-- project_knowledge_files, cloud_agent_events/checkpoints/operations) are NOT
-- given their own column: they already inherit isolation through a subquery on
-- their parent, which now carries the org scope transitively.
-- ---------------------------------------------------------------------------
ALTER TABLE public.web_conversations      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_projects          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.web_artifacts          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_memories          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.media_assets           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_tasks        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cloud_agent_runs       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_connectors        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_custom_connectors ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.api_keys               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.managed_usage_requests ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.usage_events           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Partial indexes: only org-owned rows are indexed, so personal-only
-- deployments carry no index weight and admin queries stay selective.
CREATE INDEX IF NOT EXISTS idx_web_conversations_org      ON public.web_conversations(organization_id)      WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_projects_org          ON public.user_projects(organization_id)          WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_artifacts_org          ON public.web_artifacts(organization_id)          WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_memories_org          ON public.user_memories(organization_id)          WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_org           ON public.media_assets(organization_id)           WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_org        ON public.scheduled_tasks(organization_id)        WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cloud_agent_runs_org       ON public.cloud_agent_runs(organization_id)       WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_connectors_org        ON public.user_connectors(organization_id)        WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_custom_connectors_org ON public.user_custom_connectors(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_org               ON public.api_keys(organization_id)               WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_managed_usage_requests_org ON public.managed_usage_requests(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_org           ON public.usage_events(organization_id)           WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- media_assets: close the missing RLS floor (see header).
-- ---------------------------------------------------------------------------
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Re-point every content policy at the shared tenancy predicate.
-- Each policy is dropped and recreated rather than altered so the file is
-- idempotent and the resulting rule is readable in one place.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  content_tables text[] := ARRAY[
    'web_conversations', 'user_projects', 'web_artifacts', 'user_memories',
    'media_assets', 'scheduled_tasks', 'cloud_agent_runs', 'user_connectors',
    'user_custom_connectors', 'api_keys', 'managed_usage_requests', 'usage_events'
  ];
BEGIN
  FOREACH t IN ARRAY content_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_user_isolation', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_rls '
      'USING (public.app_row_is_visible(user_id, organization_id)) '
      'WITH CHECK (public.app_row_is_writable(user_id, organization_id))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Organizations: an org owner/admin may read their own organization row.
-- Mutation stays privileged control-plane work (0054's stance, unchanged).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS organizations_active_org_read ON public.organizations;
CREATE POLICY organizations_active_org_read
  ON public.organizations
  FOR SELECT TO app_rls
  USING (id = public.current_app_org_id() AND public.current_app_org_role() IS NOT NULL);
