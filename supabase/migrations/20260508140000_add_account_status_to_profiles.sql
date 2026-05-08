-- 20260508140000_add_account_status_to_profiles.sql
--
-- Add the `account_status` column to `public.profiles`. This column is
-- already written by `apps/web/app/api/admin/security/route.ts` (suspend/
-- ban/reactivate flows) and `apps/web/app/api/webhooks/directory-sync/
-- route.ts` (SCIM lifecycle), and is read by `apps/web/utils/supabase/
-- proxy.ts:162` on every authenticated request as a security gate.
--
-- Production was returning 400 on every `select=account_status` because
-- the column was never created. Discovered via `mcp__supabase__get_logs
-- service=api` on 2026-05-08; recurring `GET /rest/v1/profiles?select=
-- account_status&id=eq.<uuid> | 400` lines.
--
-- The check-constraint mirrors the values written by the existing
-- handlers: 'active' | 'suspended' | 'banned' | 'disabled'.
--
-- Existing rows default to 'active'.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'banned', 'disabled'));

COMMENT ON COLUMN public.profiles.account_status IS
  'Lifecycle status — active (default), suspended (admin), banned (admin, permanent), disabled (SCIM directory-sync). Checked on every authenticated request via apps/web/utils/supabase/proxy.ts security gate.';

-- Index supports the gate query (eq filter on id is already covered by PK,
-- so a partial index on non-active statuses is what helps the admin views).
CREATE INDEX IF NOT EXISTS profiles_account_status_non_active_idx
  ON public.profiles (account_status)
  WHERE account_status <> 'active';
