-- 20260508150001_definer_rpc_auth_body_checks.sql
--
-- P1-22 (services audit, 2026-05-08): defense-in-depth body checks on
-- SECURITY DEFINER RPCs that previously relied solely on REVOKE/GRANT
-- for authorization.
--
-- Background
--   `add_credits` and `increment_usage` already enforce auth at the
--   function body (auth.role() = 'service_role' or auth.uid() =
--   p_user_id). If a future migration accidentally re-grants execute
--   to anon/authenticated, the body still rejects unauthorized calls.
--
--   `link_stripe_customer` (20260505000006_stripe_integration.sql)
--   and `handle_refund` (20260506120001_billing_layer_foundation.sql)
--   currently rely on GRANT-to-service_role-only — no body check. This
--   migration adds the same `auth.role() IS DISTINCT FROM 'service_role'`
--   guard the other RPCs use. Pure defense-in-depth.
--
-- Out of scope for this migration:
--   The 8 "authenticated only" RPCs listed in 20260506060000_lockdown
--   (clear_search_history, track_search, get_recent_searches,
--   get_search_suggestions, move_session_to_folder, get_branch_history,
--   get_root_session, get_message_reactions) need their bodies audited
--   in production — the function definitions are NOT in the repo
--   migration history. Surface to team-lead: pull each via `pg_get_functiondef`
--   and confirm they include `auth.uid() = p_user_id`. If any are missing
--   the check, add a follow-up migration.
--
-- Rollback
--   Revert link_stripe_customer + handle_refund bodies to the prior
--   versions (no body check). The REVOKE/GRANT machinery still locks
--   them down in normal operation.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. link_stripe_customer — service_role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_stripe_customer(
  p_user_id UUID,
  p_customer_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Defense-in-depth: refuse if the caller isn't service_role even
  -- though REVOKE/GRANT already restrict execute. A future
  -- `GRANT EXECUTE ON FUNCTION ... TO authenticated` regression would
  -- re-open the door without this check.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized: link_stripe_customer is service_role only';
  END IF;

  UPDATE public.profiles
  SET stripe_customer_id = p_customer_id,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Re-affirm the grant baseline (idempotent).
REVOKE ALL ON FUNCTION public.link_stripe_customer(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_stripe_customer(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. handle_refund — service_role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_refund(
  p_user_id uuid,
  p_refund_amount_cents integer,
  p_reason text DEFAULT 'Refund processed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account record;
  v_credits_to_revoke integer;
BEGIN
  -- Defense-in-depth: refuse if the caller isn't service_role.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized: handle_refund is service_role only';
  END IF;

  IF p_refund_amount_cents IS NULL OR p_refund_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be positive (got %)', p_refund_amount_cents;
  END IF;

  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_credits_to_revoke := LEAST(p_refund_amount_cents, v_account.credits_remaining_cents);

  UPDATE public.token_credits
  SET
    credits_remaining_cents = credits_remaining_cents - v_credits_to_revoke,
    updated_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) VALUES (
    p_user_id, v_account.id, -v_credits_to_revoke, 'refund', p_reason
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_refund(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_refund(uuid, integer, text) TO service_role;

COMMIT;
