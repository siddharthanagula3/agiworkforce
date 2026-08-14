-- 0118: let purchased credits carry a user past their rolling usage caps.
--
-- PROBLEM
-- -------
-- Two independent gates gouvern a managed request, and only one of them ever
-- honoured a top-up:
--
--   * the billing-period ledger (`insufficient_credits`) — `add_credits` raises
--     `token_credits.credits_allocated_cents`, so buying credits genuinely
--     raises this ceiling;
--   * the rolling 5-hour / weekly / flagship-weekly caps — decided here, from
--     `p_*_cap_cents` values derived purely from the PLAN TIER. The purchased
--     balance was never part of the comparison.
--
-- Because each plan's 5-hour slice is a fraction of its monthly allowance, the
-- rolling cap is the gate a heavy user meets first and repeatedly. A subscriber
-- on the top tier (`max_15x`) had no recourse at all: nothing above them to
-- upgrade to, and credits that did not lift the wall they had actually hit.
--
-- WHY THE WINDOW HAS TO BE SPLIT
-- ------------------------------
-- The naive fix — add the remaining balance onto the cap — cuts users off with
-- credits still unspent. Overage spend lands in `credit_transactions` like any
-- other deduction, so it inflates the window total AND depletes the balance:
-- the two move toward each other at twice the rate, and the user is refused
-- while still holding balance they paid for.
--
-- So overage-funded deductions are tagged and EXCLUDED from the plan window,
-- and metered against their own budget instead. `v_session_used` therefore
-- means "spend charged to the plan", which is what the plan cap is about.
--
-- HOW A DEDUCTION GETS TAGGED
-- ---------------------------
-- Exactly the way `is_flagship` already does it: the reservation writes the
-- flag onto the request's credit_transactions row immediately after acquiring
-- (see the metadata update at the end of this function). No new plumbing
-- through settlement, and no second source of truth.
--
-- POLICY LIVES IN THE CALLER
-- --------------------------
-- This function receives `p_top_up_headroom_cents` as a plain number and asks
-- no questions. Whether the account opted in, and how much purchased balance
-- remains, is decided in TypeScript where it is testable — the caller passes 0
-- to mean "no overage", which reproduces the previous behaviour exactly.

begin;

-- Opt-in. Default FALSE deliberately: spending someone's purchased balance
-- without asking is worse than stopping at the limit they already expected.
alter table public.subscriptions
  add column if not exists overage_enabled boolean not null default false;

comment on column public.subscriptions.overage_enabled is
  'When true, requests refused by a rolling usage cap may instead draw on remaining purchased top-up balance. Opt-in; see migration 0118.';

drop function if exists public.reserve_managed_usage_request_with_limits(
  text, text, text, text, text, integer, text, integer, integer, integer, integer, boolean
);

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
  v_overage_used integer := 0;
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
    or p_session_cap_cents is null or p_session_cap_cents < 0
    or p_weekly_cap_cents is null or p_weekly_cap_cents < 0
    or p_flagship_weekly_cap_cents is null or p_flagship_weekly_cap_cents < 0
    or p_is_flagship is null then
    raise exception using errcode = '22023', message = 'invalid managed usage limits';
  end if;

  -- Serialize by tenant before reading the shared trailing ledger. The lock is
  -- transaction-scoped, so a second request observes the first reservation's
  -- deduction after commit and cannot pass the same remaining allowance.
  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  -- Lost-response and concurrent retries retain the legacy function's exact
  -- immutable-idempotency behavior. Their estimate is already represented by
  -- the first reservation and must not be added to the rolling projection twice.
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

  -- Plan-charged spend and overage-funded spend are metered separately. Every
  -- `filter` below excludes `is_overage` rows from the plan totals; dropping
  -- that exclusion silently reintroduces the double-depletion described above.
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
    ), 0)::integer,
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.metadata->>'is_overage' = 'true'
    ), 0)::integer
  into v_session_used, v_weekly_used, v_flagship_weekly_used, v_overage_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  -- Each cap is tested against plan-charged spend first. Only a request the
  -- plan cannot cover is considered for overage, and overage is granted solely
  -- when the remaining purchased balance covers this request on top of the
  -- overage already spent in the same 7-day ledger read.
  if p_session_cap_cents > 0
    and v_session_used + p_estimated_cost_cents > p_session_cap_cents then
    if v_headroom > 0 and v_overage_used + p_estimated_cost_cents <= v_headroom then
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

  if p_weekly_cap_cents > 0
    and v_weekly_used + p_estimated_cost_cents > p_weekly_cap_cents then
    if v_headroom > 0 and v_overage_used + p_estimated_cost_cents <= v_headroom then
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
    and p_flagship_weekly_cap_cents > 0
    and v_flagship_weekly_used + p_estimated_cost_cents > p_flagship_weekly_cap_cents then
    if v_headroom > 0 and v_overage_used + p_estimated_cost_cents <= v_headroom then
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

    -- `is_overage` rides along with `is_flagship` on the same write, so the tag
    -- this function's own window arithmetic depends on can never be missing
    -- from a row it admitted.
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
