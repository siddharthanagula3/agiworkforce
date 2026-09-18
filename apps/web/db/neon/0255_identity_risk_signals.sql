-- =============================================================================
-- Migration 0255: risk observations and the account-compromise response record
--
-- Why    : security_audit_logs records what happened, one row at a time, with
--          no place to put the coarse location or the device a sign-in came
--          from, so nothing could compare this sign-in with the last one.
--          Impossible travel, a first sign-in from a country, and a new device
--          arriving alongside a factor change were therefore undetectable, and
--          the product had no record of a compromise response either: revoking
--          every session left an audit line and nothing a support agent or the
--          account holder could open later.
--
-- Shape  : identity_risk_observations is one row per observed identity event.
--          The address is stored only as the HMAC digest that ip-hash.ts
--          produces, never in the clear; country and a coarse latitude and
--          longitude come from the edge headers and are what impossible travel
--          is computed from. account_compromise_responses is one row per run of
--          the guided flow, carrying what it revoked and whether the account
--          holder still has to finish a password reset.
--
-- Empty  : Both tables start empty. A risk assessment with no history returns
--          no signal, so the first sign-in of every account is unremarkable
--          rather than suspicious.
--
-- Depends: 0014 (security_audit_logs), 0037 (profiles, current_app_user_id),
--          0207 (device_registrations, the app_rls isolation convention)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.identity_risk_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 1 AND 64),
  outcome text NOT NULL DEFAULT 'success'
    CHECK (outcome = ANY (ARRAY['success', 'failure'])),
  -- HMAC digest from ip-hash.ts. The address itself is never written here.
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  device_ref text CHECK (device_ref IS NULL OR char_length(device_ref) <= 128),
  surface text CHECK (surface IS NULL OR char_length(surface) <= 32),
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_risk_observations_user
  ON public.identity_risk_observations (user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_risk_observations_failures
  ON public.identity_risk_observations (user_id, observed_at DESC)
  WHERE outcome = 'failure';

CREATE TABLE IF NOT EXISTS public.account_compromise_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Which risk signal opened it, or 'reported' when the account holder did.
  trigger text NOT NULL CHECK (char_length(trigger) BETWEEN 1 AND 64),
  sessions_revoked integer NOT NULL DEFAULT 0 CHECK (sessions_revoked >= 0),
  sessions_failed integer NOT NULL DEFAULT 0 CHECK (sessions_failed >= 0),
  password_reset_required boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT account_compromise_responses_resolved_after_open
    CHECK (resolved_at IS NULL OR resolved_at >= opened_at)
);

CREATE INDEX IF NOT EXISTS idx_account_compromise_responses_open
  ON public.account_compromise_responses (user_id, opened_at DESC)
  WHERE resolved_at IS NULL;

GRANT SELECT ON public.identity_risk_observations TO app_rls;
GRANT SELECT ON public.account_compromise_responses TO app_rls;

ALTER TABLE public.identity_risk_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_risk_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.account_compromise_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_compromise_responses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_risk_observations_user_isolation
  ON public.identity_risk_observations;
CREATE POLICY identity_risk_observations_user_isolation
  ON public.identity_risk_observations
  FOR SELECT TO app_rls
  USING (user_id = (SELECT public.current_app_user_id()));

DROP POLICY IF EXISTS account_compromise_responses_user_isolation
  ON public.account_compromise_responses;
CREATE POLICY account_compromise_responses_user_isolation
  ON public.account_compromise_responses
  FOR SELECT TO app_rls
  USING (user_id = (SELECT public.current_app_user_id()));

COMMENT ON TABLE public.identity_risk_observations IS
  'One row per observed identity security event, with the coarse location and device the risk engine compares against the previous ones. Addresses are stored only as HMAC digests. Written on the service connection; app_rls reads only its own rows.';
COMMENT ON TABLE public.account_compromise_responses IS
  'One row per run of the guided account-compromise flow: what it revoked, and whether the account holder still owes a password reset.';

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. An address in the clear is refused:
-- --    INSERT INTO public.identity_risk_observations (user_id, event_key, ip_hash)
-- --    VALUES ('<an existing profiles.id>', 'new_sign_in', '203.0.113.7');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 2. A digest is accepted:
-- --    INSERT INTO public.identity_risk_observations (user_id, event_key, ip_hash, country)
-- --    VALUES ('<same user>', 'new_sign_in', repeat('a', 64), 'US');
-- --    EXPECT: INSERT 0 1
--
-- -- 3. app_rls cannot write:
-- --    SET ROLE app_rls;
-- --    INSERT INTO public.identity_risk_observations (user_id, event_key)
-- --    VALUES ('<same user>', 'new_sign_in');
-- --    EXPECT: ERROR permission denied for table identity_risk_observations
-- --    RESET ROLE;
--
-- -- 4. Clean up:
-- --    DELETE FROM public.identity_risk_observations WHERE event_key = 'new_sign_in';
-- =============================================================================
