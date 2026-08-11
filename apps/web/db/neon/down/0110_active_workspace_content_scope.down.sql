-- Reversal of 0110: restore 0073's owner-visible-across-scopes behavior and
-- remove request-scoped insert defaults. Organization columns remain intact.

BEGIN;

ALTER TABLE public.web_conversations      ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.user_projects          ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.web_artifacts           ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.user_memories           ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.media_assets            ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.scheduled_tasks          ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.cloud_agent_runs         ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.user_connectors          ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.user_custom_connectors   ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.api_keys                 ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.managed_usage_requests   ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE public.usage_events             ALTER COLUMN organization_id DROP DEFAULT;

DROP FUNCTION IF EXISTS public.track_search(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_recent_searches(text, uuid, integer);
DROP FUNCTION IF EXISTS public.get_popular_searches(text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_search_suggestions(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.clear_search_history(text, uuid);
DROP INDEX IF EXISTS public.idx_search_history_user_org_created;
ALTER TABLE public.search_history DROP COLUMN IF EXISTS organization_id;

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

DELETE FROM public.schema_migrations
 WHERE filename = '0110_active_workspace_content_scope.sql';

COMMIT;
