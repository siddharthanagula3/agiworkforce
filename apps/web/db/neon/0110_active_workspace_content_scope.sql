-- =============================================================================
-- Migration 0110: make the active workspace a real content boundary
--
-- 0073 added nullable organization ownership, but its owner shortcut allowed a
-- user to see all of their rows regardless of the active workspace. That made
-- the workspace selector cosmetic for RLS-backed routes. This migration makes
-- Personal (NULL) and each organization mutually exclusive scopes, while
-- retaining owner/admin visibility for other members' rows in the active org.
--
-- Existing rows are intentionally not backfilled: they remain Personal. New
-- RLS-scoped writes inherit the request's already-validated org GUC. Privileged
-- application routes must still bind organization_id explicitly because they
-- do not execute as app_rls and therefore do not receive this default context.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.app_row_is_visible(row_user_id text, row_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (
        row_user_id = public.current_app_user_id()
        AND row_org_id IS NOT DISTINCT FROM public.current_app_org_id()
      )
      OR (
        row_org_id IS NOT NULL
        AND row_org_id = public.current_app_org_id()
        AND public.current_app_org_role() IN ('owner', 'admin')
      );
$$;

CREATE OR REPLACE FUNCTION public.app_row_is_writable(row_user_id text, row_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT row_user_id = public.current_app_user_id()
     AND row_org_id IS NOT DISTINCT FROM public.current_app_org_id()
     AND (
       row_org_id IS NULL
       OR public.current_app_org_role() IS NOT NULL
     );
$$;

-- The application sets request.jwt.claim.org_id only after resolving a real
-- membership. Using the same request-local value as the insert default keeps
-- existing RLS-scoped sync routes catalog-free and prevents consumer drift.
ALTER TABLE public.web_conversations      ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.user_projects          ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.web_artifacts           ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.user_memories           ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
-- media_assets is written through a privileged repository that captures the
-- admitted workspace explicitly. Its schema-readiness guard intentionally
-- forbids defaults so asynchronous jobs cannot inherit an unrelated DB/GUC
-- context at completion time.
ALTER TABLE public.scheduled_tasks          ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.cloud_agent_runs         ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.user_connectors          ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.user_custom_connectors   ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.api_keys                 ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.managed_usage_requests   ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
ALTER TABLE public.usage_events             ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();

-- Search text can itself contain confidential project/customer terms. Keep
-- recent/popular/suggestion history in the same active scope as its results.
ALTER TABLE public.search_history
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.search_history
  ALTER COLUMN organization_id SET DEFAULT public.current_app_org_id();
CREATE INDEX IF NOT EXISTS idx_search_history_user_org_created
  ON public.search_history(user_id, organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.track_search(
  p_user_id text,
  p_organization_id uuid,
  p_query text,
  p_result_count integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN RETURN; END IF;
  INSERT INTO public.search_history (user_id, organization_id, query, result_count)
  VALUES (p_user_id, p_organization_id, trim(p_query), coalesce(p_result_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recent_searches(
  p_user_id text,
  p_organization_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(query text, searched_at timestamptz)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT ON (sh.query) sh.query, sh.created_at AS searched_at
      FROM public.search_history sh
     WHERE sh.user_id = p_user_id
       AND sh.organization_id IS NOT DISTINCT FROM p_organization_id
     ORDER BY sh.query, sh.created_at DESC
     LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_popular_searches(
  p_user_id text,
  p_organization_id uuid,
  p_limit integer DEFAULT 10,
  p_days integer DEFAULT 7
)
RETURNS TABLE(query text, search_count bigint, avg_results numeric)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT sh.query,
           count(*)::bigint AS search_count,
           avg(sh.result_count)::numeric AS avg_results
      FROM public.search_history sh
     WHERE sh.user_id = p_user_id
       AND sh.organization_id IS NOT DISTINCT FROM p_organization_id
       AND sh.created_at >= now() - (p_days || ' days')::interval
     GROUP BY sh.query
     ORDER BY search_count DESC
     LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_search_suggestions(
  p_user_id text,
  p_organization_id uuid,
  p_partial_query text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(suggestion text, source text, score numeric)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT ON (sh.query)
           sh.query AS suggestion,
           'recent'::text AS source,
           1.0::numeric AS score
      FROM public.search_history sh
     WHERE sh.user_id = p_user_id
       AND sh.organization_id IS NOT DISTINCT FROM p_organization_id
       AND sh.query ILIKE '%' || p_partial_query || '%'
     ORDER BY sh.query, sh.created_at DESC
     LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_search_history(
  p_user_id text,
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.search_history
   WHERE user_id = p_user_id
     AND organization_id IS NOT DISTINCT FROM p_organization_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMIT;
