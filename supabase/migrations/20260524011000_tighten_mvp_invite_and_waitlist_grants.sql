-- 20260524011000_tighten_mvp_invite_and_waitlist_grants.sql
--
-- Follow-up to 20260524010000 after running Supabase security advisors.
-- Keep the public waitlist insert path, but make the RLS predicate validate
-- the normalized row shape instead of using WITH CHECK (true). Also remove
-- external EXECUTE grants from the trigger helper function and explicitly
-- prevent anon execution of the invite redemption RPC.

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.cloud_managed_waitlist;

CREATE POLICY "Anyone can join waitlist"
  ON public.cloud_managed_waitlist
  FOR INSERT
  WITH CHECK (
    email = lower(btrim(email))
    AND length(email) BETWEEN 3 AND 254
    AND position('@' in email) > 1
    AND source IN ('byok', 'sync', 'billing', 'other')
  );

REVOKE ALL ON FUNCTION public.beta_invites_increment_uses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_invites_increment_uses() FROM anon;
REVOKE ALL ON FUNCTION public.beta_invites_increment_uses() FROM authenticated;

REVOKE ALL ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_and_redeem_invite_code(text, text, text) TO authenticated;
