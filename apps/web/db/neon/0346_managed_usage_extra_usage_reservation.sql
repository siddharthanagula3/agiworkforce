-- =============================================================================
-- Migration 0346: reserve a request on extra usage alone
--
-- Why    : fast mode is billed from usage credits even while the plan's
--          included usage remains, as Claude does. 0281's admission sends a
--          request to purchased headroom only once a plan window is spent, so a
--          fast request would draw on the plan first.
--
-- Shape  : reserve_managed_usage_request_on_extra_usage_microusd admits a
--          request only when usage credits are turned on and their headroom
--          covers its estimate, reserves it through the same lifecycle
--          function 0281 delegates to, and marks it is_overage from its first
--          ledger row, so it never counts against the rolling plan windows.
--          Bonus credits alone never admit it. The switch and the headroom are
--          read under the per-user advisory lock, so concurrent requests see
--          each other's is_overage reservations in flight. A request refused
--          either way is declined with extra_usage_required. Provider-step
--          extensions already admit an is_overage request against the
--          headroom alone (0305).
-- =============================================================================

begin;

create or replace function public.reserve_managed_usage_request_on_extra_usage_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_microusd bigint,
  p_lease_token text,
  p_lease_seconds integer,
  p_is_flagship boolean
)
returns table(
  reservation_decision text,
  request_status text,
  lease_token text,
  estimated_cost_microusd bigint,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
declare
  v_usage_credits_on boolean;
  v_headroom bigint;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
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
    from public.reserve_managed_usage_request_microusd(
      p_user_id,
      p_idempotency_key,
      p_request_hash,
      p_provider,
      p_model,
      p_estimated_cost_microusd,
      p_lease_token,
      p_lease_seconds
    ) legacy;
    return;
  end if;

  select coalesce(bool_or(subscription_row.overage_enabled), false)
    into v_usage_credits_on
  from public.subscriptions subscription_row
  where subscription_row.user_id = p_user_id;

  v_headroom := greatest(coalesce((
    select balances.overage_headroom_microusd
    from public.prepaid_credit_balances_microusd(p_user_id) balances
  ), 0), 0);

  if not v_usage_credits_on or p_estimated_cost_microusd > v_headroom then
    return query select
      'extra_usage_required'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_microusd,
      null::text,
      'EXTRA_USAGE_REQUIRED'::text;
    return;
  end if;

  select legacy.* into v_reservation
  from public.reserve_managed_usage_request_microusd(
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_microusd,
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
        is_overage = true,
        updated_at = now()
    where request_row.user_id = p_user_id
      and request_row.idempotency_key = p_idempotency_key
    returning request_row.id into v_request_id;

    update public.credit_transactions transaction_row
    set metadata = coalesce(transaction_row.metadata, '{}'::jsonb)
      || jsonb_build_object('is_flagship', p_is_flagship, 'is_overage', true)
    where transaction_row.user_id = p_user_id
      and transaction_row.metadata->>'managed_usage_request_id' = v_request_id::text;
  end if;

  return query select
    v_reservation.reservation_decision::text,
    v_reservation.request_status::text,
    v_reservation.lease_token::text,
    v_reservation.estimated_cost_microusd::bigint,
    v_reservation.settlement_status::text,
    v_reservation.error_code::text;
end;
$$;

revoke all on function public.reserve_managed_usage_request_on_extra_usage_microusd(
  text, text, text, text, text, bigint, text, integer, boolean
) from public;
grant execute on function public.reserve_managed_usage_request_on_extra_usage_microusd(
  text, text, text, text, text, bigint, text, integer, boolean
) to app_rls;

comment on function public.reserve_managed_usage_request_on_extra_usage_microusd(
  text, text, text, text, text, bigint, text, integer, boolean
) is
  'Reserves a managed usage request on usage credits alone, only while they are turned on, marked is_overage from its first ledger row, for usage billed as extra usage whatever the plan windows hold.';

commit;
