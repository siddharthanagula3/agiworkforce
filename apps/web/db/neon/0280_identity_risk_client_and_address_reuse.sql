-- =============================================================================
-- Migration 0278: the browser a sign-in came from, and address reuse across accounts
--
-- Why    : the risk engine could tell a new device from a known one but not a
--          new browser from a known one, because an observation carried only a
--          device reference. It also counted failures for one account, which is
--          the shape of a password guessed against one person; one password
--          sprayed across many accounts from the same address left five
--          unremarkable single failures and no signal at all.
--
-- Shape  : user_agent_ref is the HMAC digest that ip-hash.ts produces for the
--          client header, never the header itself, so two sign-ins from the
--          same browser compare equal without the string being stored. The new
--          partial index answers "how many other accounts has this address
--          failed against lately" without a sequential scan; the existing
--          failure index is keyed on user_id first and cannot serve it.
--
-- Empty  : The column is NULL for every row written before this. A NULL client
--          produces no signal, so old history stays unremarkable rather than
--          turning every returning browser into a new one.
--
-- Depends: 0255 (identity_risk_observations)
-- =============================================================================

BEGIN;

ALTER TABLE public.identity_risk_observations
  ADD COLUMN IF NOT EXISTS user_agent_ref text
    CHECK (user_agent_ref IS NULL OR user_agent_ref ~ '^[0-9a-f]{64}$');

CREATE INDEX IF NOT EXISTS idx_identity_risk_observations_address_failures
  ON public.identity_risk_observations (ip_hash, observed_at DESC)
  WHERE outcome = 'failure' AND ip_hash IS NOT NULL;

COMMENT ON COLUMN public.identity_risk_observations.user_agent_ref IS
  'HMAC digest of the client header under the ip-hash pseudonymization key. The header itself is never written. NULL means the observation had no client to identify.';

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A client string in the clear is refused:
-- --    INSERT INTO public.identity_risk_observations (user_id, event_key, user_agent_ref)
-- --    VALUES ('<an existing profiles.id>', 'new_sign_in', 'Mozilla/5.0');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 2. A digest is accepted:
-- --    INSERT INTO public.identity_risk_observations (user_id, event_key, user_agent_ref)
-- --    VALUES ('<same user>', 'new_sign_in', repeat('b', 64));
-- --    EXPECT: INSERT 0 1
--
-- -- 3. The cross-account count uses the new index rather than a scan:
-- --    EXPLAIN SELECT count(DISTINCT user_id) FROM public.identity_risk_observations
-- --     WHERE ip_hash = repeat('a', 64) AND outcome = 'failure'
-- --       AND observed_at >= now() - interval '1 day';
-- --    EXPECT: Index Scan using idx_identity_risk_observations_address_failures
--
-- -- 4. Clean up:
-- --    DELETE FROM public.identity_risk_observations
-- --     WHERE event_key = 'new_sign_in' AND user_agent_ref = repeat('b', 64);
-- =============================================================================
