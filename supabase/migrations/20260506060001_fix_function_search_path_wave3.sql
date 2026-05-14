-- Pin search_path on 11 wave-3 trigger functions flagged by Supabase
-- security advisor (function_search_path_mutable). SECURITY DEFINER functions
-- with a mutable search_path can be hijacked by user-defined schemas earlier
-- in the search_path. Pinning to (public, pg_temp) closes that vector.
--
-- Audit: agi-codex-bug-audit-2026-05-06 (DB-FUNC-SEARCH-PATH-MUTABLE)

ALTER FUNCTION public.update_vibe_session_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_dispatch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_workforce_task_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_vibe_session_on_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_projects_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_teams_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_scheduled_tasks_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_workspace_usage_quotas_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_device_pairings_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_cross_device_threads_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_connector_tool_permissions_updated_at() SET search_path = public, pg_temp;
