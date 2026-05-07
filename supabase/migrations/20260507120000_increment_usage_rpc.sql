-- 20260507120000_increment_usage_rpc.sql
-- Adds the SECURITY DEFINER RPC `public.increment_usage` that the web layer
-- already calls from `apps/web/lib/assert-quota.ts:485` via
-- `userClient.rpc('increment_usage', { p_user_id, p_tokens, p_feature })`.
--
-- Without this function the post-stream `reconcileUsage` path silently fails
-- and the per-period `token_credits.credits_used_cents` counter never advances,
-- which means quota checks in `assertQuota` (which read that same counter via
-- the RLS-bound `getUserClient`) under-count usage and never paywall.
--
-- Audit refs:
--   - parallel-spinning-hedgehog.md §6 "Role correctness" — "Usage increment:
--     SECURITY DEFINER RPC only" called via the user JWT (NOT service_role).
--   - parallel-spinning-hedgehog.md §13 Phase 2 item #5
--   - parallel-spinning-hedgehog.md §14 Discovered Follow-up #3
--   - tasks/todo.md "Phase 2a cleanup" Task #11 (initial RPC) and Task #18
--     (this dual-role auth correction).
--
-- Design constraints:
--   - SECURITY DEFINER + pinned `search_path = public, pg_temp` (matches the
--     hardening pass in 20260506060000_lockdown_definer_functions.sql and
--     20260506060001_fix_function_search_path_wave3.sql).
--   - DUAL-ROLE AUTH MODEL — different from billing-layer companions like
--     `add_credits` / `handle_refund` (which are service_role-only because
--     they originate from Stripe webhooks running outside any user context):
--       * `service_role` is allowed unconditionally (cron / batch reconciliation
--         / admin paths).
--       * `authenticated` is allowed ONLY when `auth.uid() = p_user_id`. This
--         is the production hot path: the web layer calls this RPC via
--         `getUserClient(token)` (anon-key + user JWT) per the locked
--         architectural principle "Never introduce new service_role bypass
--         paths for user-scoped operations". SECURITY DEFINER bypasses RLS,
--         so we explicitly verify the row being mutated belongs to the
--         calling user — preventing cross-tenant increment even with a stolen
--         RPC handle.
--   - Atomic: a single `UPDATE` on the active period row plus one `INSERT`
--     into `credit_transactions`. No client-side read-modify-write.
--   - Idempotent definition: `CREATE OR REPLACE` so re-applying this migration
--     is a no-op against the live schema.
--   - Positive-amount guard: `p_tokens` MUST be > 0. Without this, a
--     malicious authenticated caller could pass a negative integer to "credit"
--     themselves by reducing the `credits_used_cents` counter.
--   - Argument shape MUST exactly match the JS call site:
--       p_user_id  uuid    (from JWT-parsed userId)
--       p_tokens   integer (actualTokens from model usage metadata)
--       p_feature  text    (default 'chat'; nullable from caller perspective)

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id uuid,
  p_tokens integer,
  p_feature text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- Auth gate: allow service_role for cron/admin paths, OR allow authenticated
  -- users to increment ONLY their own usage row. Self-increment is safe because
  -- the SECURITY DEFINER context bypasses RLS but we explicitly verify the row
  -- being mutated belongs to the calling user.
  IF auth.role() = 'service_role' THEN
    -- Service role: trusted, full access. Used by cron jobs, batch reconciliation.
    NULL;
  ELSIF auth.role() = 'authenticated' AND auth.uid() = p_user_id THEN
    -- User self-increment: must match auth.uid(). Prevents one user incrementing
    -- another's counter even though SECURITY DEFINER bypasses RLS.
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized: cannot increment usage for another user';
  END IF;

  -- Positive-amount guard. Without this, a malicious authenticated caller
  -- could pass a negative integer to reduce their `credits_used_cents` and
  -- effectively grant themselves credits. The JS call site in
  -- `apps/web/lib/assert-quota.ts:475` early-returns on `actualTokens <= 0`,
  -- but the RPC must be safe against direct SQL-console / future-consumer use.
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'p_tokens must be positive (got %)', p_tokens;
  END IF;

  -- Locate the active period row for this user. Prefer the row whose
  -- [period_start, period_end] window contains the current timestamp; if
  -- none matches (clock skew / boundary race) fall back to the most recent
  -- period_end so we never silently drop usage attribution.
  SELECT id INTO v_account_id
  FROM public.token_credits
  WHERE user_id = p_user_id
    AND CURRENT_TIMESTAMP BETWEEN period_start AND period_end
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.token_credits
    WHERE user_id = p_user_id
    ORDER BY period_end DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- No row at all for this user — emit a NOTICE and return without raising.
  -- reconcileUsage is fire-and-forget post-stream; we never want to throw a
  -- visible error to the caller when the underlying issue is "billing layer
  -- not yet provisioned for this user". The accompanying logger.error in
  -- assert-quota.ts only fires on RPC-level errors (network / permission).
  IF v_account_id IS NULL THEN
    RAISE NOTICE 'increment_usage: no token_credits row for user %', p_user_id;
    RETURN;
  END IF;

  -- Atomic counter advance on the active-period row.
  UPDATE public.token_credits
  SET
    credits_used_cents = credits_used_cents + p_tokens,
    updated_at = now()
  WHERE id = v_account_id;

  -- Audit-trail row. transaction_type = 'deduction' is one of the values
  -- whitelisted by the credit_transactions CHECK constraint defined in
  -- 20260506120001_billing_layer_foundation.sql:193-196.
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description,
    metadata
  ) VALUES (
    p_user_id,
    v_account_id,
    p_tokens,
    'deduction',
    'Usage increment via reconcileUsage',
    jsonb_build_object('feature', COALESCE(p_feature, 'chat'))
  );
END;
$$;

-- Dual-role grant. The in-function `auth.role()` / `auth.uid()` gate is the
-- primary defense; the EXECUTE grant only opens the door wide enough for the
-- two trusted roles. PUBLIC and anon remain revoked.
REVOKE ALL ON FUNCTION public.increment_usage(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, integer, text) TO service_role, authenticated;
