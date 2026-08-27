-- 0152 — restore the null/zero cap contract 0070 established, which 0118/0119
-- silently reverted.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- TWO FAILURES, ONE LINE APART.
--
-- (1) UNCAPPED PLANS CANNOT SPEND A CENT. `getPlanSessionUsageCapCents`,
-- `getPlanWeeklyUsageCapCents` and `getPlanFlagshipWeeklyUsageCapCents` return
-- NULL for any tier `isPlanUsageUncapped` recognises (lib/server/
-- managed-usage-policy.ts), and `reserveManagedUsageRequest` passes those NULLs
-- straight through as $9/$10/$11. 0119's parameter validation reads:
--
--     if ... or p_session_cap_cents is null or p_session_cap_cents < 0 ...
--       raise exception using errcode = '22023';
--
-- so every managed turn from an uncapped workspace raises `invalid managed
-- usage limits`, which `queryOne` surfaces as a 503 "Managed usage billing is
-- temporarily unavailable." The highest-revenue tier is the one tier that
-- cannot transact. 0070 already had the right form —
-- `(p_session_cap_cents is not null and p_session_cap_cents < 0)` — and 0118
-- reintroduced the null rejection when it rewrote the function for overage.
--
-- (2) A CAP OF EXACTLY ZERO DISABLES ENFORCEMENT. 0119 gates each rolling
-- ceiling on `p_session_cap_cents > 0`, so a cap of 0 skips the comparison
-- entirely and means UNLIMITED. That is the precise inversion 0070 was written
-- to close: a zero-budget tier that later receives a promo or support credit
-- has a spendable balance and no rolling ceiling at all, and one script drains
-- the grant in minutes.
--
-- THE CONTRACT, unchanged from 0070 and matched by the TypeScript caller:
--
--   cap IS NULL  -> the tier declares itself uncapped. No ceiling applied.
--   cap = 0      -> deny every reservation against the paid cents ledger.
--   cap > 0      -> that ceiling.
--
-- Only the parameter validation and the three guard conditions change. The
-- overage headroom semantics 0118 introduced and 0119 corrected — the split
-- window, the `is_overage` tag, `v_headroom` as the running budget — are
-- reproduced verbatim, as are the reservation, idempotency, settlement and
-- lease semantics. The signature is unchanged, so `create or replace` keeps the
-- existing grants and comments and no `drop function` is needed.

begin;

create or replace function public.reserve_managed_usage_request_with_limits(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_cents integer,
  p_lease_token text,
  p_lease_seconds integer,
  p_session_cap_cents integer,
  p_weekly_cap_cents integer,
  p_flagship_weekly_cap_cents integer,
  p_is_flagship boolean,
  p_top_up_headroom_cents integer default 0
)
returns table(
  reservation_decision text,
  request_status text,
  lease_token text,
  estimated_cost_cents integer,
  settlement_status text,
  error_code text
)
language plpgsql
as $function$
declare
  v_session_used integer := 0;
  v_weekly_used integer := 0;
  v_flagship_weekly_used integer := 0;
  v_headroom integer := greatest(coalesce(p_top_up_headroom_cents, 0), 0);
  v_is_overage boolean := false;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_estimated_cost_cents is null or p_estimated_cost_cents < 0
    or (p_session_cap_cents is not null and p_session_cap_cents < 0)
    or (p_weekly_cap_cents is not null and p_weekly_cap_cents < 0)
    or (p_flagship_weekly_cap_cents is not null and p_flagship_weekly_cap_cents < 0)
    or p_is_flagship is null then
    raise exception using errcode = '22023', message = 'invalid managed usage limits';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  if exists (
    select 1
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
  ) then
    return query
    select legacy.*
    from public.reserve_managed_usage_request(
      p_user_id,
      p_idempotency_key,
      p_request_hash,
      p_provider,
      p_model,
      p_estimated_cost_cents,
      p_lease_token,
      p_lease_seconds
    ) legacy;
    return;
  end if;

  -- Plan-charged spend only. Overage-funded deductions are excluded so that
  -- buying credits cannot burn the plan allowance the user was saving.
  select
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::integer,
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::integer,
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::integer
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_cents is not null
    and v_session_used + p_estimated_cost_cents > p_session_cap_cents then
    if p_estimated_cost_cents <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'session_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_cents,
        null::text,
        'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_weekly_cap_cents is not null
    and v_weekly_used + p_estimated_cost_cents > p_weekly_cap_cents then
    if p_estimated_cost_cents <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_cents,
        null::text,
        'ROLLING_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_cents is not null
    and v_flagship_weekly_used + p_estimated_cost_cents > p_flagship_weekly_cap_cents then
    if p_estimated_cost_cents <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'flagship_weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_cents,
        null::text,
        'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  select legacy.* into v_reservation
  from public.reserve_managed_usage_request(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_cents,
    p_lease_token,
    p_lease_seconds
  ) legacy;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'managed usage reservation returned no result';
  end if;

  if v_reservation.reservation_decision = 'acquired' then
    update public.managed_usage_requests request_row
    set is_flagship = p_is_flagship,
        updated_at = now()
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
    returning request_row.id into v_request_id;

    update public.credit_transactions transaction_row
    set metadata = coalesce(transaction_row.metadata, '{}'::jsonb)
      || jsonb_build_object('is_flagship', p_is_flagship, 'is_overage', v_is_overage)
    where transaction_row.user_id = p_user_id
      and transaction_row.metadata->>'managed_usage_request_id' = v_request_id::text;
  end if;

  return query select
    v_reservation.reservation_decision::text,
    v_reservation.request_status::text,
    v_reservation.lease_token::text,
    v_reservation.estimated_cost_cents::integer,
    v_reservation.settlement_status::text,
    v_reservation.error_code::text;
end;
$function$;

commit;
