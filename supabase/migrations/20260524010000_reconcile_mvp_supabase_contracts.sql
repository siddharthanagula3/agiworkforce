-- 20260524010000_reconcile_mvp_supabase_contracts.sql
--
-- Production reconciliation for MVP web surfaces after the historical
-- apps/web/supabase and root supabase/migrations split.
--
-- Do not apply 20260523000000_beta_invites.sql directly to production:
-- production already has beta_invites, beta_redemptions, and the
-- on_beta_redemption trigger from the older invite-offer flow. Creating the
-- newer trigger in that file would double-increment current_uses. This
-- migration adds only the missing columns and RPC contract used by
-- waitlistService.validateInviteCode.

ALTER TABLE public.beta_redemptions
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';

CREATE OR REPLACE FUNCTION public.beta_invites_increment_uses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.beta_invites
  SET current_uses = COALESCE(current_uses, 0) + 1
  WHERE id = NEW.invite_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_and_redeem_invite_code(
  p_code text,
  p_surface text,
  p_source text
)
RETURNS TABLE (valid boolean, invite_id uuid, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.beta_invites%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_already_used boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'unauthenticated'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_invite
  FROM public.beta_invites
  WHERE lower(code) = lower(p_code)
    AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid_code'::text;
    RETURN;
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN QUERY SELECT false, v_invite.id, 'expired'::text;
    RETURN;
  END IF;

  IF COALESCE(v_invite.current_uses, 0) >= COALESCE(v_invite.max_uses, 1) THEN
    RETURN QUERY SELECT false, v_invite.id, 'fully_redeemed'::text;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.beta_redemptions
    WHERE invite_id = v_invite.id
      AND user_id = v_user_id
  ) INTO v_already_used;

  IF v_already_used THEN
    RETURN QUERY SELECT false, v_invite.id, 'already_redeemed_by_user'::text;
    RETURN;
  END IF;

  INSERT INTO public.beta_redemptions (invite_id, user_id, surface, source)
  VALUES (
    v_invite.id,
    v_user_id,
    COALESCE(NULLIF(trim(p_surface), ''), 'web'),
    COALESCE(NULLIF(trim(p_source), ''), 'unknown')
  );

  RETURN QUERY SELECT true, v_invite.id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) IS
  'Atomic invite-code validation/redeem RPC for MVP cloud-bridge waitlist flows. Compatible with the older production beta_invites schema.';
