-- 0119: correct how overage headroom is metered.
--
-- 0118 shipped the check as `v_overage_used + p_estimated_cost_cents <= headroom`,
-- which assumes `headroom` is a STATIC allowance for the window. It is not.
--
-- The caller passes the REMAINING purchased balance —
-- `least(credits_allocated_cents - credits_used_cents, top_up_allocated_cents)` —
-- and a managed reservation writes its deduction immediately, so
-- `credits_used_cents` already falls as overage is spent. Adding
-- `v_overage_used` on top counts the same spend twice: after spending 10 of a
-- purchased 50, the balance reads 40 while `v_overage_used` reads 10, and the
-- user is refused at 30 rather than 40. Every overage user would be cut off at
-- roughly half the credit they paid for.
--
-- The balance is therefore the running budget on its own, and the honest test
-- is simply whether this request fits inside what is left.
--
-- `v_overage_used` is dropped from the comparison but the `is_overage` TAG
-- stays exactly as 0118 wrote it: excluding overage-funded spend from the PLAN
-- window is a separate concern and remains essential.

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
    or p_session_cap_cents is null or p_session_cap_cents < 0
    or p_weekly_cap_cents is null or p_weekly_cap_cents < 0
    or p_flagship_weekly_cap_cents is null or p_flagship_weekly_cap_cents < 0
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

  if p_session_cap_cents > 0
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

  if p_weekly_cap_cents > 0
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
    and p_flagship_weekly_cap_cents > 0
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
