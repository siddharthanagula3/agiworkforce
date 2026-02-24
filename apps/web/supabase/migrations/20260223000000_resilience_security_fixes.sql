-- Migration: Resilience and security fixes
-- Date: 2026-02-23
--
-- This migration addresses three categories of findings:
--
-- P0  Kill Switch          — Add account_status column to profiles so that
--                            suspended/banned/disabled accounts can be blocked
--                            at the application layer without deleting data.
--
-- P2  export_user_data     — Revoke direct authenticated access to the
--     auth bypass            export_user_data(UUID) function. Authenticated
--                            users must use export_my_data() which enforces
--                            self-only access via auth.uid().
--
-- M3  search_path          — Add SET search_path TO 'public', 'pg_temp' to
--     SECURITY DEFINER       SECURITY DEFINER functions that were missing it,
--     functions              preventing search_path-injection attacks.
--                            Affected: handle_refund, update_web_conversation_timestamp
--                            Skipped:  claim_beta_invite (already patched in
--                                      20260108000002_fix_claim_beta_invite_rpc_security.sql)

-- =============================================================================
-- P0: Kill switch — add account_status to profiles
-- =============================================================================

-- Add the column with a safe default so all existing rows remain 'active'.
-- The partial index only covers non-active rows, keeping it small and fast
-- for the common case (active accounts are never in the index).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'suspended', 'banned', 'disabled'));

COMMENT ON COLUMN public.profiles.account_status IS
  'Account status for kill switch. Only active accounts can authenticate. '
  'Allowed values: active | suspended | banned | disabled.';

-- Partial index: quickly find non-active accounts without scanning every row.
CREATE INDEX IF NOT EXISTS idx_profiles_account_status
  ON public.profiles(account_status)
  WHERE account_status != 'active';

-- =============================================================================
-- P2: Revoke export_user_data(UUID) direct access from authenticated role
-- =============================================================================
-- The original GDPR migration granted authenticated users the ability to call
-- export_user_data(UUID) with an arbitrary UUID, bypassing the self-only
-- restriction. Revoke that grant now.
-- Authenticated users must use export_my_data() instead, which internally
-- resolves the caller's own UUID via auth.uid().

REVOKE EXECUTE ON FUNCTION public.export_user_data(UUID) FROM authenticated;

-- Ensure the safe self-service wrapper remains callable by authenticated users.
-- (This grant was already applied in the GDPR migration, but is re-stated here
-- for clarity and to be idempotent.)
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- =============================================================================
-- M3: Fix search_path on SECURITY DEFINER functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- M3a: handle_refund
-- Source: 20260115000000_critical_fixes_gdpr_compliance.sql
-- Change: Add SET search_path TO 'public', 'pg_temp' to the function header.
--         The function body is otherwise identical to the current definition.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_refund(
  p_user_id UUID,
  p_refund_amount_cents INTEGER,
  p_reason TEXT DEFAULT 'Refund processed'
) RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
  v_credits_to_revoke INTEGER;
BEGIN
  -- Get the user's credit account
  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Calculate credits to revoke (proportional to refund)
  v_credits_to_revoke := LEAST(p_refund_amount_cents, v_account.credits_remaining_cents);

  -- Deduct credits
  UPDATE public.token_credits
  SET
    credits_remaining_cents = credits_remaining_cents - v_credits_to_revoke,
    updated_at = NOW()
  WHERE id = v_account.id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    v_account.id,
    -v_credits_to_revoke,
    'refund',
    p_reason
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public', 'pg_temp';

-- Restore the grant that was present in the original migration.
GRANT EXECUTE ON FUNCTION public.handle_refund TO service_role;

-- -----------------------------------------------------------------------------
-- M3b: update_web_conversation_timestamp
-- Source: 20260117000000_add_web_chat.sql
-- Change: Add SECURITY DEFINER + SET search_path TO 'public', 'pg_temp'.
--         The original function was a plain trigger function with no SECURITY
--         DEFINER clause. As a trigger fired by INSERT on web_messages (owned
--         by authenticated users) it runs as the invoking user, but adding
--         SECURITY DEFINER with a locked search_path prevents any search_path
--         manipulation from affecting the UPDATE it executes on web_conversations.
--         The function body is otherwise identical to the current definition.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_web_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.web_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public', 'pg_temp';

-- The trigger itself does not need to be recreated; it already points to this
-- function by name (update_conversation_on_message on web_messages).

-- =============================================================================
-- ANALYZE: refresh planner statistics after schema change
-- =============================================================================

ANALYZE public.profiles;
