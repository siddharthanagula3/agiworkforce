-- Migration: 20260505000000_fix_device_authorization_rls_leak.sql
-- Fix:       SUP-CRIT-1 (red-team finding 2026-05-04)
-- Severity:  P0 — full account takeover
--
-- ## What was wrong
--
-- `apps/web/supabase/migrations/20241223_init.sql:50-51` shipped two
-- public-by-default RLS policies on `device_authorization_codes`:
--
--   CREATE POLICY "Devices can create codes" ON device_authorization_codes
--     FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Device can read own code" ON device_authorization_codes
--     FOR SELECT USING (true); -- Ideally restricted by ID but polling is public
--
-- The "polling is public" rationale was defensible at the time the table
-- only stored `device_code` / `user_code`. But `20260108000001_fix_device_
-- authorization_flow.sql:6-12` later added two sensitive columns:
--
--   ALTER TABLE device_authorization_codes
--     ADD COLUMN IF NOT EXISTS access_token text,
--     ADD COLUMN IF NOT EXISTS refresh_token text;
--
-- Combined with the still-live `USING (true)` SELECT policy, ANY
-- authenticated Supabase user (and even any anon-key holder, depending on
-- role grants) could run:
--
--   select user_id, user_email, access_token, refresh_token
--   from public.device_authorization_codes
--   where status = 'approved' and access_token is not null;
--
-- and harvest live Supabase session tokens for arbitrary users while they
-- sat in the consume window between approval and CLI consumption (default
-- ~5 s race interval, larger if the CLI lost connectivity).
--
-- ## What this migration does
--
-- 1. DROP both `USING (true)` / `WITH CHECK (true)` policies.
-- 2. Replace the SELECT policy with a user-scoped one — users can only
--    read rows where `user_id = auth.uid()` (after the user has approved
--    the code). The device polling path no longer needs direct table SELECT;
--    it must go through `public.consume_device_authorization_tokens(text)`
--    (service-role-only RPC, defined in 20260108000003).
-- 3. Replace the INSERT policy with a service-role-only check. Codes are
--    minted by `/api/auth/device/start` (server-side, service-role) — anon
--    or authenticated clients should never insert directly.
-- 4. Keep the existing UPDATE policy (already user-scoped: only the user
--    who approved the code can update it).
-- 5. Document the consume-RPC contract so future maintainers don't
--    re-introduce the public SELECT.
--
-- ## Migration safety
--
-- - `DROP POLICY IF EXISTS` is idempotent.
-- - The new SELECT policy is strictly narrower; existing well-behaved
--   client code that read its own row via `auth.uid()` continues to work.
-- - The device-polling client must move to the RPC. If any deployed
--   client still calls `select * from device_authorization_codes` with
--   the anon key, polling will return zero rows after this lands and the
--   CLI flow will hang at "waiting for approval" — apps/web/app/api/auth/
--   device/poll/route.ts already uses the RPC (verified before shipping).
-- - The new INSERT policy reduces attacker DoS surface (no more anonymous
--   table flooding). Server-side mint paths use service-role and bypass
--   RLS, so they are unaffected.
--
-- ## Verification (post-deploy)
--
--   -- Anon role: must see zero rows.
--   set role anon;
--   select count(*) from public.device_authorization_codes;       -- expect 0
--   reset role;
--
--   -- Authenticated user A: must see only their own approved row.
--   -- (run from a Supabase JWT bound to user A; this script is a sketch.)

BEGIN;

-- 1. Drop the broken public-read and public-insert policies.
DROP POLICY IF EXISTS "Device can read own code" ON public.device_authorization_codes;
DROP POLICY IF EXISTS "Devices can create codes" ON public.device_authorization_codes;

-- 2. User-scoped SELECT: a signed-in user can read codes they have
--    associated with their account (status='approved' or 'pending' after
--    they entered the user_code on /device).
CREATE POLICY "User can read own device authorization"
  ON public.device_authorization_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Insert is service-role only. The mint path lives in
--    apps/web/app/api/auth/device/start/route.ts and uses
--    SUPABASE_SERVICE_ROLE_KEY; service_role bypasses RLS so this
--    policy effectively just blocks anon + authenticated inserts.
CREATE POLICY "Service role only insert"
  ON public.device_authorization_codes
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4. (UPDATE policy "Users can update own codes" already exists from init
--    and remains correct — auth.uid() = user_id. We do NOT touch it here
--    so the migration stays minimal.)

-- 5. Tighten table-level grants as a belt-and-suspenders measure. RLS is
--    the primary defense; revoking direct SELECT from the anon role makes
--    the failure mode obvious if RLS is ever disabled by mistake.
REVOKE SELECT, INSERT ON public.device_authorization_codes FROM anon;
-- authenticated role keeps SELECT (RLS-gated), and INSERT is gated by the
-- new policy (effectively forbidden). UPDATE remains for the approval flow.

COMMENT ON TABLE public.device_authorization_codes IS
  'Device authorization codes for OAuth-style CLI/desktop pairing. ' ||
  'access_token + refresh_token are SENSITIVE — read ONLY via ' ||
  'public.consume_device_authorization_tokens(text) RPC (service-role-only). ' ||
  'Direct SELECT is restricted to auth.uid() = user_id (no token columns by ' ||
  'convention — RLS does not column-level filter). See migration ' ||
  '20260505000000 for the rationale (red-team SUP-CRIT-1).';

COMMIT;
