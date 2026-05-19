-- Batch 4b (audit 2026-05-19): close the 4 genuine SECURITY DEFINER advisor
-- findings surfaced by mcp__supabase__get_advisors. The other 13 SECURITY DEFINER
-- warnings flagged by the linter are false positives (already enforce
-- auth.uid()=p_user_id internally). The linter cannot see into function bodies,
-- so its count will stay non-zero — the actual privilege-escalation exposure is
-- what these four CREATE OR REPLACE statements fix.
--
-- Related: harden_security_definer_advisor_findings_20260519 in remote
-- supabase_migrations.schema_migrations at version 20260519092127.

-- 1. is_account_active: was anon-callable, enabling account enumeration of any
--    user_id. Now requires authentication (service_role still bypasses).
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authorized: is_account_active requires authentication';
    END IF;
  END IF;
  RETURN COALESCE(
    (SELECT account_status = 'active' FROM public.profiles WHERE id = p_user_id),
    true
  );
END;
$function$;

-- 2. get_popular_searches: was anon-callable analytics. Requires authentication.
--    Aggregate-only output (query, count, avg_results) is acceptable for
--    signed-in users; anon callers blocked.
CREATE OR REPLACE FUNCTION public.get_popular_searches(p_limit integer DEFAULT 10, p_days integer DEFAULT 7)
 RETURNS TABLE(query text, search_count bigint, avg_results numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authorized: get_popular_searches requires authentication';
    END IF;
  END IF;
  RETURN QUERY
    SELECT sh.query, COUNT(*)::BIGINT AS search_count, AVG(sh.result_count)::NUMERIC AS avg_results
    FROM public.search_history sh
    WHERE sh.created_at >= now() - (p_days || ' days')::INTERVAL
    GROUP BY sh.query
    ORDER BY search_count DESC
    LIMIT p_limit;
END;
$function$;

-- 3. get_search_suggestions: drop the cross-user 'popular' UNION which read
--    other users' search_history matching ILIKE '%p_partial_query%'. Targeted
--    partial queries (user names, project names) could surface cross-user
--    queries. Keep only the per-user 'recent' branch (properly auth-guarded).
CREATE OR REPLACE FUNCTION public.get_search_suggestions(p_user_id uuid, p_partial_query text, p_limit integer DEFAULT 5)
 RETURNS TABLE(suggestion text, source text, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized: get_search_suggestions can only read own recent history';
    END IF;
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (sh.query)
      sh.query AS suggestion, 'recent'::TEXT AS source, 1.0::NUMERIC AS score
    FROM public.search_history sh
    WHERE sh.user_id = p_user_id
      AND sh.query ILIKE '%' || p_partial_query || '%'
    ORDER BY sh.query, sh.created_at DESC
    LIMIT p_limit;
END;
$function$;

-- 4. move_session_to_folder: also verify p_folder_id ownership when non-null
--    so a session cannot be moved into another user's folder (data-integrity
--    issue, not a privilege escalation, but worth closing).
CREATE OR REPLACE FUNCTION public.move_session_to_folder(p_session_id uuid, p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_folder_id IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_folders
      WHERE id = p_folder_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized: cannot move session into folder you do not own';
    END IF;
  END IF;
  UPDATE public.web_conversations
  SET folder_id = p_folder_id, updated_at = now()
  WHERE id = p_session_id AND user_id = auth.uid();
END;
$function$;
