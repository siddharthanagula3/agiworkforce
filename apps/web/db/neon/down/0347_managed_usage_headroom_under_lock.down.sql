-- Reversal of 0347 : reservations take purchased headroom from the caller again.
--
-- WHAT THIS COSTS: a reservation reads headroom before the lock again, so
-- concurrent reservations can together spend past purchased headroom. The
-- bodies below are 0281's and 0305's, verbatim.

begin;

create or replace function public.reserve_managed_usage_request_with_limits_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_microusd bigint,
  p_lease_token text,
  p_lease_seconds integer,
  p_session_cap_microusd bigint,
  p_weekly_cap_microusd bigint,
  p_flagship_weekly_cap_microusd bigint,
  p_is_flagship boolean,
  p_top_up_headroom_microusd bigint default 0
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
  v_session_used bigint := 0;
  v_weekly_used bigint := 0;
  v_flagship_weekly_used bigint := 0;
  v_headroom bigint := greatest(coalesce(p_top_up_headroom_microusd, 0), 0);
  v_is_overage boolean := false;
  v_request_id uuid;
  v_reservation record;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
    or (p_session_cap_microusd is not null and p_session_cap_microusd < 0)
    or (p_weekly_cap_microusd is not null and p_weekly_cap_microusd < 0)
    or (p_flagship_weekly_cap_microusd is not null and p_flagship_weekly_cap_microusd < 0)
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

  select
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_microusd is not null
    and v_session_used + p_estimated_cost_microusd > p_session_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'session_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_weekly_cap_microusd is not null
    and v_weekly_used + p_estimated_cost_microusd > p_weekly_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'ROLLING_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_microusd is not null
    and v_flagship_weekly_used + p_estimated_cost_microusd > p_flagship_weekly_cap_microusd then
    if p_estimated_cost_microusd <= v_headroom then
      v_is_overage := true;
    else
      return query select
        'flagship_weekly_limit'::text,
        'declined'::text,
        null::text,
        p_estimated_cost_microusd,
        null::text,
        'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
      return;
    end if;
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
        is_overage = v_is_overage,
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
    v_reservation.estimated_cost_microusd::bigint,
    v_reservation.settlement_status::text,
    v_reservation.error_code::text;
end;
$$;

revoke all on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) from public;
grant execute on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) to app_rls;

comment on function public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
) is
  'Atomically enforces private rolling spend ceilings in microUSD, records whether purchased headroom covered the request, and delegates the durable managed usage lifecycle.';

create or replace function public.extend_managed_usage_request_provider_step_microusd(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_operation_key text,
  p_estimated_cost_microusd bigint,
  p_session_cap_microusd bigint,
  p_weekly_cap_microusd bigint,
  p_flagship_weekly_cap_microusd bigint,
  p_is_flagship boolean,
  p_top_up_headroom_microusd bigint default 0
)
returns table(
  extension_decision text,
  request_status text,
  estimated_cost_microusd bigint,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_extension public.managed_usage_request_extensions%rowtype;
  v_settlement record;
  v_session_used bigint := 0;
  v_weekly_used bigint := 0;
  v_flagship_weekly_used bigint := 0;
  v_renewed_lease timestamptz;
  v_headroom bigint := greatest(coalesce(p_top_up_headroom_microusd, 0), 0);
  v_was_overage boolean;
  v_limit_code text;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_operation_key is null
    or p_operation_key !~ '^provider:[1-9][0-9]{0,8}$'
    or p_estimated_cost_microusd is null or p_estimated_cost_microusd < 0
    or (p_session_cap_microusd is not null and p_session_cap_microusd < 0)
    or (p_weekly_cap_microusd is not null and p_weekly_cap_microusd < 0)
    or (p_flagship_weekly_cap_microusd is not null and p_flagship_weekly_cap_microusd < 0)
    or p_is_flagship is null then
    raise exception using errcode = '22023', message = 'invalid provider-step reservation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('managed-usage:' || p_user_id, 0)
  );

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token
    or v_request.is_flagship is distinct from p_is_flagship
    or v_request.status <> 'provider_started'
    or v_request.lease_expires_at <= now() then
    return query select
      'conflict'::text,
      coalesce(v_request.status, 'unknown')::text,
      coalesce(v_request.estimated_cost_microusd, 0)::bigint,
      null::text,
      'STATE_CONFLICT'::text;
    return;
  end if;

  -- 0178's renewal, reproduced: reaching here proves the turn is still
  -- executing, so its lease moves out at least an hour, never shortening a
  -- longer window a caller reserved up front, and never past the absolute
  -- ceiling measured from creation.
  update public.managed_usage_requests request_row
  set lease_expires_at = least(
        greatest(
          request_row.lease_expires_at,
          now() + make_interval(secs => 3600)
        ),
        request_row.created_at + make_interval(secs => 86400)
      ),
      updated_at = now()
  where request_row.id = v_request.id
  returning request_row.lease_expires_at into v_renewed_lease;
  v_request.lease_expires_at := v_renewed_lease;

  if v_request.initial_provider_operation_key is null then
    update public.managed_usage_requests request_row
    set initial_provider_operation_key = p_operation_key,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  if v_request.initial_provider_operation_key = p_operation_key then
    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  insert into public.managed_usage_request_extensions (
    request_id,
    user_id,
    operation_key,
    estimated_cost_microusd,
    estimated_cost_cents
  ) values (
    v_request.id,
    p_user_id,
    p_operation_key,
    p_estimated_cost_microusd,
    public.microusd_to_cents_mirror(p_estimated_cost_microusd)
  ) on conflict (request_id, operation_key) do nothing;

  select extension_row.* into v_extension
  from public.managed_usage_request_extensions extension_row
  where extension_row.request_id = v_request.id
    and extension_row.operation_key = p_operation_key
  for update;

  if not found
    or v_extension.estimated_cost_microusd is distinct from p_estimated_cost_microusd then
    return query select
      'conflict'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      'IDEMPOTENCY_CONFLICT'::text;
    return;
  end if;

  if v_extension.status = 'extended' then
    return query select
      'already_extended'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      null::text;
    return;
  end if;

  if v_extension.status = 'declined' then
    return query select
      case v_extension.error_code
        when 'ROLLING_FIVE_HOUR_LIMIT_REACHED' then 'session_limit'
        when 'ROLLING_WEEKLY_LIMIT_REACHED' then 'weekly_limit'
        when 'FLAGSHIP_WEEKLY_LIMIT_REACHED' then 'flagship_weekly_limit'
        else 'declined'
      end,
      v_request.status,
      v_request.estimated_cost_microusd,
      v_extension.settlement_status,
      v_extension.error_code;
    return;
  end if;

  select
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint,
    coalesce(sum(transaction_row.amount_microusd) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
        and transaction_row.metadata->>'is_overage' is distinct from 'true'
    ), 0)::bigint
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_microusd is not null
    and v_session_used + p_estimated_cost_microusd > p_session_cap_microusd then
    v_limit_code := 'ROLLING_FIVE_HOUR_LIMIT_REACHED';
  elsif p_weekly_cap_microusd is not null
    and v_weekly_used + p_estimated_cost_microusd > p_weekly_cap_microusd then
    v_limit_code := 'ROLLING_WEEKLY_LIMIT_REACHED';
  elsif p_is_flagship
    and p_flagship_weekly_cap_microusd is not null
    and v_flagship_weekly_used + p_estimated_cost_microusd
        > p_flagship_weekly_cap_microusd then
    v_limit_code := 'FLAGSHIP_WEEKLY_LIMIT_REACHED';
  end if;

  v_was_overage := v_request.is_overage;
  if v_was_overage or v_limit_code is not null then
    if p_estimated_cost_microusd > v_headroom then
      v_limit_code := coalesce(v_limit_code, 'INSUFFICIENT_CREDITS');
      update public.managed_usage_request_extensions extension_row
      set status = 'declined',
          error_code = v_limit_code,
          updated_at = now()
      where extension_row.request_id = v_request.id
        and extension_row.operation_key = p_operation_key;

      return query select
        case v_limit_code
          when 'ROLLING_FIVE_HOUR_LIMIT_REACHED' then 'session_limit'
          when 'ROLLING_WEEKLY_LIMIT_REACHED' then 'weekly_limit'
          when 'FLAGSHIP_WEEKLY_LIMIT_REACHED' then 'flagship_weekly_limit'
          else 'declined'
        end,
        v_request.status,
        v_request.estimated_cost_microusd,
        null::text,
        v_limit_code;
      return;
    end if;

    if not v_was_overage then
      update public.managed_usage_requests request_row
      set is_overage = true,
          updated_at = now()
      where request_row.id = v_request.id;
    end if;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement_microusd(
    p_user_id,
    p_estimated_cost_microusd,
    'Managed usage provider-step reservation',
    jsonb_build_object(
      'type', 'managed_usage_extension',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model,
      'operation_key', p_operation_key
    ),
    'managed-extend:' || v_request.id::text || ':' || p_operation_key
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'provider-step reservation returned no result';
  end if;

  if v_settlement.settlement_status = 'succeeded'
    and v_settlement.deduction_success then
    update public.managed_usage_requests request_row
    set estimated_cost_microusd =
          request_row.estimated_cost_microusd + p_estimated_cost_microusd,
        estimated_cost_cents = public.microusd_to_cents_mirror(
          request_row.estimated_cost_microusd + p_estimated_cost_microusd
        ),
        updated_at = now()
    where request_row.id = v_request.id
    returning request_row.estimated_cost_microusd into v_request.estimated_cost_microusd;

    update public.managed_usage_request_extensions extension_row
    set status = 'extended',
        settlement_status = 'succeeded',
        error_code = null,
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'extended'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      'succeeded'::text,
      null::text;
    return;
  end if;

  if v_settlement.settlement_status = 'pending' then
    update public.managed_usage_request_extensions extension_row
    set settlement_status = 'pending',
        error_code = v_settlement.error_code,
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'unavailable'::text,
      v_request.status,
      v_request.estimated_cost_microusd,
      'pending'::text,
      v_settlement.error_code;
    return;
  end if;

  if not v_was_overage then
    update public.managed_usage_requests request_row
    set is_overage = false,
        updated_at = now()
    where request_row.id = v_request.id
      and request_row.is_overage;
  end if;

  update public.managed_usage_request_extensions extension_row
  set status = 'declined',
      settlement_status = 'terminal',
      error_code = coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS'),
      updated_at = now()
  where extension_row.request_id = v_request.id
    and extension_row.operation_key = p_operation_key;

  return query select
    'declined'::text,
    v_request.status,
    v_request.estimated_cost_microusd,
    'terminal'::text,
    coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS')::text;
end;
$$;

revoke all on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, bigint
) from public;
grant execute on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, bigint
) to app_rls;

comment on function public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean, bigint
) is
  'Idempotently reserves each provider operation in microUSD under the original tenant, request, lease, rolling caps, and billing-period balance, renewing the lease as 0178 requires. A step the plan windows cannot hold is admitted from purchased headroom, and from then on the request is overage usage.';

delete from public.schema_migrations
 where filename = '0347_managed_usage_headroom_under_lock.sql';

commit;
