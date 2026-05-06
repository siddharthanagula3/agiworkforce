-- Lock down SECURITY DEFINER functions that were callable by anon/authenticated
-- without internal auth checks. Service_role retains access (used by Stripe webhook,
-- gateway, cron). Trigger functions still fire from triggers since trigger context
-- runs as the table owner regardless of REST permissions.
--
-- Audit: agi-codex-bug-audit-2026-05-06 (DB-RPC-1..9)

-- A) service_role only
REVOKE EXECUTE ON FUNCTION public.mark_stripe_event_succeeded(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_stripe_event_failed(text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_event_idempotent(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_stripe_customer(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_refund(uuid, integer, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_by_stripe_customer_id(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_all_user_tokens(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_token_revoked(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_device_authorization_tokens(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_email_prefs() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_web_conversation_timestamp() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_invite_usage() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_denied_tokens() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pairing_sessions() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_video_tasks() FROM anon, authenticated, PUBLIC;

-- B) authenticated only — REVOKE FROM anon (RLS on underlying tables enforces auth.uid())
REVOKE EXECUTE ON FUNCTION public.clear_search_history(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.track_search(uuid, text, integer, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_searches(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_search_suggestions(uuid, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_session_to_folder(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_branch_history(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_root_session(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_message_reactions(uuid[]) FROM anon, PUBLIC;
