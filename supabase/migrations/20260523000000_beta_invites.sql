-- =============================================================================
-- Beta invite-code infrastructure
-- Date: 2026-05-23
-- Purpose: Enables the v1 cloud-bridge invite-code flow.
--   beta_invites  — admin-managed invite codes (rate-controlled cloud access)
--   beta_redemptions — per-user redemption records (unique per user per code)
--   validate_and_redeem_invite_code — atomic RPC; only path to read invite state
-- =============================================================================

-- ---------------------------------------------------------------------------
-- beta_invites
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.beta_invites (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text        NOT NULL,            -- stored UPPERCASE; lookup via lower(code)
    max_uses    integer     NOT NULL DEFAULT 1,
    current_uses integer    NOT NULL DEFAULT 0,
    expires_at  timestamptz,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        REFERENCES auth.users(id),
    metadata    jsonb       NOT NULL DEFAULT '{}',

    CONSTRAINT beta_invites_code_unique UNIQUE (code)
);

-- Case-insensitive lookup without citext extension
CREATE INDEX IF NOT EXISTS beta_invites_lower_code_idx
    ON public.beta_invites (lower(code));

-- ---------------------------------------------------------------------------
-- beta_redemptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.beta_redemptions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id   uuid        NOT NULL REFERENCES public.beta_invites(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id),
    redeemed_at timestamptz NOT NULL DEFAULT now(),
    surface     text        NOT NULL,   -- 'desktop' | 'web' | 'mobile' | 'chrome' | 'vscode'
    source      text        NOT NULL,   -- which UI trigger: 'connectors' | 'shared-links' | etc.

    CONSTRAINT beta_redemptions_unique_user UNIQUE (invite_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Trigger: increment current_uses on each redemption
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.beta_invites_increment_uses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.beta_invites
    SET current_uses = current_uses + 1
    WHERE id = NEW.invite_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER beta_redemptions_after_insert
    AFTER INSERT ON public.beta_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION public.beta_invites_increment_uses();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_redemptions ENABLE ROW LEVEL SECURITY;

-- beta_invites: no direct SELECT/INSERT/UPDATE/DELETE for anon or authenticated.
-- All validation flows through the security-definer RPC below.
-- Service role bypasses RLS (admin tooling).

-- beta_redemptions: authenticated users may SELECT their own redemptions.
CREATE POLICY "beta_redemptions_select_own"
    ON public.beta_redemptions
    FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT is handled exclusively by the RPC (security definer); direct insert
-- is blocked so callers cannot bypass the use-count check.

-- ---------------------------------------------------------------------------
-- RPC: validate_and_redeem_invite_code
--
-- Atomic transaction.  Returns one row:
--   valid boolean   — true on success
--   invite_id uuid  — populated on success or on 'expired'/'fully_redeemed' errors
--   error text      — null on success; one of:
--                     'invalid_code' | 'expired' | 'fully_redeemed' | 'already_redeemed_by_user'
--
-- Callers: authenticated users only (enforced via GRANT below).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_and_redeem_invite_code(
    p_code    text,
    p_surface text,
    p_source  text
)
RETURNS TABLE (valid boolean, invite_id uuid, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invite        public.beta_invites%ROWTYPE;
    v_already_used  boolean := false;
BEGIN
    -- 1. Look up the invite code (case-insensitive)
    SELECT *
    INTO v_invite
    FROM public.beta_invites
    WHERE lower(code) = lower(p_code)
      AND is_active = true;

    -- 2. Not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::uuid, 'invalid_code'::text;
        RETURN;
    END IF;

    -- 3. Expired
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RETURN QUERY SELECT false, v_invite.id, 'expired'::text;
        RETURN;
    END IF;

    -- 4. Fully redeemed
    IF v_invite.current_uses >= v_invite.max_uses THEN
        RETURN QUERY SELECT false, v_invite.id, 'fully_redeemed'::text;
        RETURN;
    END IF;

    -- 5. Check for prior redemption by this user
    SELECT EXISTS (
        SELECT 1
        FROM public.beta_redemptions
        WHERE invite_id = v_invite.id
          AND user_id   = auth.uid()
    ) INTO v_already_used;

    IF v_already_used THEN
        RETURN QUERY SELECT false, v_invite.id, 'already_redeemed_by_user'::text;
        RETURN;
    END IF;

    -- 6. Insert redemption record (trigger increments current_uses)
    INSERT INTO public.beta_redemptions (invite_id, user_id, surface, source)
    VALUES (v_invite.id, auth.uid(), p_surface, p_source);

    -- 7. Success
    RETURN QUERY SELECT true, v_invite.id, NULL::text;
END;
$$;

-- Only authenticated users may call this function
REVOKE ALL ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) TO authenticated;

COMMENT ON TABLE public.beta_invites IS
    'Admin-managed invite codes for v1 cloud-bridge access. No direct SELECT via anon/user — use validate_and_redeem_invite_code RPC.';

COMMENT ON TABLE public.beta_redemptions IS
    'Per-user invite code redemptions. One row per (invite_id, user_id) pair.';
