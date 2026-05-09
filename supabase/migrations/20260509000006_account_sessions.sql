-- =============================================================================
-- account_sessions — login-session ledger for Trusted-Device enrollment gating
-- Date: 2026-05-09
-- Wave: 5.9
-- Source: tasks/research/EXECUTION_PLAN_2026-05-09.md §1.7 follow-up
--          tasks/research/exec/w51-worker-migrations-report.md §8.1
--          services/api-gateway/src/worker/registration.ts:222-238 (read)
--
-- Background: Task 1.7 (`task-1.7-services-inversion`) shipped a Trusted-Device
-- enrollment endpoint (`POST /api/auth/trusted_devices`) that gates on session
-- age — the most-recent `account_sessions` row for the user must be < 10 min
-- old. The endpoint queries:
--
--   const { data: session } = await client
--     .from('account_sessions')
--     .select('created_at')
--     .eq('user_id', userId)
--     .order('created_at', { ascending: false })
--     .limit(1)
--     .maybeSingle();
--
-- Verified 2026-05-09 via mcp__supabase__execute_sql:
--   - public.account_sessions does NOT exist in prod
--   - auth.sessions (Supabase Auth built-in) DOES exist with `created_at` but
--     is NOT what the registration code is querying — code uses unprefixed
--     'account_sessions' which the supabase-js client routes through PostgREST
--     to public.account_sessions
--
-- Without this table, every Trusted-Device enrollment returns
-- `NO_ACTIVE_SESSION` — the gate never passes for any user. The api-gateway's
-- existing test (`§12 Trusted-Device enrollment` in worker.test.ts) accepts
-- that as the green path because the test mocks the supabase client; the bug
-- only manifests against real Supabase.
--
-- == Design decisions ==
--
-- * Minimal schema: only the columns the read path needs (id, user_id,
--   created_at) plus housekeeping (updated_at). Token data is intentionally
--   absent — the writer side has not yet been written. When the writer is
--   added (e.g. an Express middleware that records every successful /login),
--   it can ALTER the table to add token fields.
--
-- * RLS: service_role full access only. The api-gateway's registration.ts
--   uses getServiceClient() (service-role key) to read this — no user-direct
--   path. If a future feature needs user-direct reads (e.g. a "your active
--   sessions" UI) a TO authenticated SELECT-own policy is the right add.
--
-- * search_path pinned on the trigger function per HIGH-1 wave-3 lockdown
--   convention (20260506060001_fix_function_search_path_wave3.sql).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_sessions (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Read path: ".eq('user_id', ...).order('created_at', ascending: false).limit(1)"
-- Index supports the per-user latest-row lookup directly.
CREATE INDEX IF NOT EXISTS idx_account_sessions_user_id_created_at
    ON public.account_sessions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_account_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_account_sessions_updated_at ON public.account_sessions;
CREATE TRIGGER trigger_account_sessions_updated_at
    BEFORE UPDATE ON public.account_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_account_sessions_updated_at();

ALTER TABLE public.account_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_sessions: service_role full access"
    ON public.account_sessions FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE public.account_sessions IS
    'Login-session ledger; one row per successful /login. Used by the ' ||
    'api-gateway Trusted-Device enrollment gate to enforce a 10-min ' ||
    'enrollment-after-login window. Created in Wave 5.9 (2026-05-09) to ' ||
    'unblock services/api-gateway/src/worker/registration.ts:222-238 in prod. ' ||
    'Writer side (insert on /login) is a follow-up: today the table starts ' ||
    'empty so every Trusted-Device enrollment hits NO_ACTIVE_SESSION until ' ||
    'the writer is wired.';

COMMIT;
