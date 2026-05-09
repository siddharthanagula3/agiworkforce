-- =============================================================================
-- rotate_dispatch_keys RPC + dispatch_keys table for HKDF salt rotation
-- Date: 2026-05-09
-- Source: tasks/research/EXECUTION_PLAN_2026-05-09.md §1.2 (Wave 4 dispatch-listener)
--          tasks/research/exec/1.2-report.md (dispatch-engineer's flag)
--          apps/desktop/src/services/dispatch.ts (caller; on task-1.2-dispatch-listener)
--          apps/mobile/lib/dispatchHmac.ts (HKDF reference)
--
-- Background: Task 1.2 shipped `apps/desktop/src/services/dispatch.ts` which
-- exposes `rotateDispatchKey(pairingCode, supabaseRpc)`. The supabaseRpc
-- closure wraps a call to a Supabase RPC named `rotate_dispatch_keys` and
-- destructures `{ new_salt }` from the response. The RPC and its backing
-- `dispatch_keys` table did not exist; this migration creates both.
--
-- Naming note: Task #3's prose called the columns `current_key` and
-- `previous_key`, but the dispatch protocol is **HKDF-salt-based** (mobile
-- and desktop derive the actual HMAC key from `pairingCode + sessionSalt`
-- via HKDF-SHA-256 — see apps/mobile/lib/dispatchHmac.ts:hkdfExtract). The
-- server only knows the salt, never the derived key. We therefore use
-- semantically-correct names (`current_salt`, `previous_salt`) for the
-- stored columns and have the RPC RETURN a column literally named `new_salt`
-- because that's what the desktop caller's destructure expects today. A
-- second RPC return column `previous_salt` is provided for a future
-- grace-window verification flow (the dispatch.ts module's docstring says
-- "Two active key slots are supported"); current desktop callers ignore it.
--
-- Threat model: salt rotation invalidates the HKDF-derived session key, so
-- any future message signed under the old key after the grace window will
-- fail verification. Salts are NOT secret (they ride in plaintext metadata)
-- but are bound to a per-device row gated by RLS so a different user's
-- desktop cannot read another user's salt history.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. dispatch_keys table — stores the rotation history per device
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dispatch_keys (
    device_id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_salt         text        NOT NULL,
    previous_salt        text,
    grace_period_seconds integer     NOT NULL DEFAULT 604800,  -- 7 days
    rotated_at           timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for grace-window expiry queries (rotated_at + grace_period).
CREATE INDEX IF NOT EXISTS idx_dispatch_keys_rotated_at
    ON public.dispatch_keys (rotated_at);

-- updated-at trigger (mirrors created_at convention; rotated_at is the
-- semantic "updated" field here since rotation is the only mutation).
ALTER TABLE public.dispatch_keys ENABLE ROW LEVEL SECURITY;

-- RLS: service_role full access; users can read their own row only.
-- Direct row WRITES are forbidden — only the SECURITY DEFINER RPC mutates.
CREATE POLICY "dispatch_keys: service_role full access"
    ON public.dispatch_keys FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "dispatch_keys: user can read own"
    ON public.dispatch_keys FOR SELECT
    TO authenticated
    USING (auth.uid() = device_id);

COMMENT ON TABLE public.dispatch_keys IS
    'HKDF-salt rotation history for the desktop↔mobile Dispatch HMAC channel. ' ||
    'One row per user (treated as device pair). Mutation is gated through the ' ||
    'rotate_dispatch_keys RPC; direct writes are forbidden via RLS. Created ' ||
    'in Wave 5.3 (2026-05-09).';

COMMENT ON COLUMN public.dispatch_keys.current_salt IS
    'The active 32-byte salt (hex-encoded). Mobile + desktop both derive ' ||
    'the HMAC session key via HKDF-SHA-256(pairingCode, current_salt).';

COMMENT ON COLUMN public.dispatch_keys.previous_salt IS
    'The salt active before the most recent rotation. Used by the ' ||
    'dispatch listener to verify in-flight messages signed under the old ' ||
    'key during the grace window.';

COMMENT ON COLUMN public.dispatch_keys.grace_period_seconds IS
    'How long after rotated_at the previous_salt is honored. Defaults to ' ||
    '604800s (7 days).';


-- -----------------------------------------------------------------------------
-- 2. rotate_dispatch_keys RPC
-- -----------------------------------------------------------------------------
--
-- Generates a fresh 32-byte random salt for the caller's device,
-- moves the old current_salt to previous_salt, and returns the new salt
-- so the caller can pass it to dispatch_hmac_init.
--
-- Return shape: TABLE(new_salt text, previous_salt text, grace_period_seconds int)
--   - new_salt: the freshly-generated salt (UPSERT result; what the caller
--     uses going forward).
--   - previous_salt: the value of current_salt just before rotation (NULL
--     on the first ever rotation for this device).
--   - grace_period_seconds: how long previous_salt remains honored.
--
-- Auth: SECURITY DEFINER + service_role grant. Callers from desktop go
-- through the gateway/server (which holds the service-role key) — direct
-- anon/authenticated invocation is REVOKEd in the lockdown migration.
-- The DEFINER body itself defends against caller mismatch by requiring
-- p_device_id = auth.uid() for any non-service_role invocation.
--
-- Idempotency: safe to call repeatedly; each call rotates again. There is
-- no de-dup window — the desktop is expected to call this only on key
-- compromise or scheduled rotation.

CREATE OR REPLACE FUNCTION public.rotate_dispatch_keys(p_device_id uuid)
RETURNS TABLE (
    new_salt             text,
    previous_salt        text,
    grace_period_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role text := current_setting('request.jwt.claim.role', true);
    v_caller_uid  uuid;
    v_old_salt    text;
    v_new_salt    text;
    v_grace_secs  integer;
BEGIN
    -- Defence-in-depth body check: when the caller is not service_role,
    -- they must rotate only their own device. (The 20260506060000 lockdown
    -- pattern: definer functions assert their own auth even if the caller
    -- happens to bypass policy enforcement at the table level.)
    IF v_caller_role IS DISTINCT FROM 'service_role' THEN
        v_caller_uid := auth.uid();
        IF v_caller_uid IS NULL OR v_caller_uid <> p_device_id THEN
            RAISE EXCEPTION 'rotate_dispatch_keys: caller % cannot rotate device %',
                COALESCE(v_caller_uid::text, '<anon>'), p_device_id
                USING ERRCODE = '42501';  -- insufficient_privilege
        END IF;
    END IF;

    -- Generate a 32-byte random salt, hex-encoded (64 chars).
    v_new_salt := encode(gen_random_bytes(32), 'hex');

    -- UPSERT: rotate or initialise. ON CONFLICT branch shifts current → previous.
    INSERT INTO public.dispatch_keys (device_id, current_salt, previous_salt, rotated_at)
        VALUES (p_device_id, v_new_salt, NULL, now())
    ON CONFLICT (device_id) DO UPDATE SET
        previous_salt = public.dispatch_keys.current_salt,
        current_salt  = EXCLUDED.current_salt,
        rotated_at    = now()
    RETURNING public.dispatch_keys.previous_salt, public.dispatch_keys.grace_period_seconds
        INTO v_old_salt, v_grace_secs;

    new_salt             := v_new_salt;
    previous_salt        := v_old_salt;          -- NULL on first ever rotation
    grace_period_seconds := COALESCE(v_grace_secs, 604800);
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.rotate_dispatch_keys(uuid) IS
    'Rotates the HKDF salt for a device''s Dispatch HMAC channel. Returns ' ||
    '(new_salt, previous_salt, grace_period_seconds). The desktop caller ' ||
    'in apps/desktop/src/services/dispatch.ts:rotateDispatchKey destructures ' ||
    '{ new_salt } today; previous_salt + grace_period_seconds are reserved ' ||
    'for the future two-key grace-window verification flow.';

-- Default grant to service_role only. The lockdown migration REVOKEs from
-- anon + authenticated + PUBLIC. authenticated callers can still invoke
-- after the lockdown via SECURITY DEFINER ↔ EXECUTE-grant interaction:
-- the DEFINER body checks auth.uid() = p_device_id, so we explicitly
-- GRANT EXECUTE TO authenticated below to allow direct desktop-side calls
-- when the gateway is bypassed (e.g. desktop app talking directly to
-- Supabase via the user's JWT).
GRANT EXECUTE ON FUNCTION public.rotate_dispatch_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_dispatch_keys(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_dispatch_keys(uuid) FROM PUBLIC, anon;

COMMIT;
