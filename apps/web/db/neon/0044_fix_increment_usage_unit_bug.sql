-- 0044 — Fix critical usage-accounting bug (tokens charged as cents).
--
-- ROOT CAUSE (proven via ledger forensics, 2026-06):
--   public.increment_usage(p_user_id, p_tokens, ...) added the raw TOKEN COUNT
--   (p_tokens) directly to credits_used_cents — a CENTS column — and inserted a
--   credit_transactions row of transaction_type='deduction' with
--   amount_cents = p_tokens ("usage increment via reconcileUsage").
--
--   It ran on EVERY completion (via reconcileUsage in the LLM completions path),
--   IN ADDITION to the authoritative deduct_credits() reservation/reconciliation
--   flow. Result: a 3,531-token request was charged $35.31 instead of its real
--   ~$0.01 cost. On one account this inflated credits_used_cents from a true
--   $0.31 to $124.20 (17 bogus rows = $123.89), driving the balance negative and
--   hard-blocking all model execution (402).
--
-- FIX:
--   credits_used_cents is maintained EXCLUSIVELY by deduct_credits() (which adds
--   the cost in CENTS, is idempotency-keyed, and tracks flagship_used_today_cents).
--   increment_usage must never write the cents ledger again. The completion-path
--   callers (reconcileUsage in response-builder.ts / stream-transform.ts) are
--   removed in the same change. This function is neutered to a safe no-op with
--   its signature preserved for backward compatibility — so any lingering caller
--   can no longer corrupt the ledger.

create or replace function public.increment_usage(
  p_user_id text,
  p_tokens integer,
  p_feature text default null,
  p_is_flagship boolean default false
)
returns void
language plpgsql
as $$
begin
  -- DEPRECATED / NO-OP (migration 0044).
  -- This function previously added p_tokens (a TOKEN COUNT) to credits_used_cents
  -- (a CENTS ledger), double-charging usage. The cents ledger is owned solely by
  -- deduct_credits(). Intentionally a no-op to prevent re-introduction.
  perform 1;
  return;
end;
$$;
