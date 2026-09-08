-- Reversal of 0178 : return the managed usage lease to a one-hour clamp that
-- nothing renews.
--
-- WHAT THIS COSTS: the defect 0178 fixed comes back. Any turn that runs longer
-- than its reserved window is reclaimed as stale, the user is refunded, and the
-- real provider cost is absorbed with nothing billed. Reverse this only to
-- unblock a deploy, and re-apply 0178 in the same day.
--
-- Rows are untouched. A lease already renewed past one hour keeps the
-- expiry it was given; it simply will not be renewed again, so it drains to
-- recovery on its own schedule rather than being cut short.
--
-- The two bodies below are 0056's reserve_managed_usage_request and 0070's
-- extend_managed_usage_request_provider_step, verbatim.

begin;

create or replace function public.reserve_managed_usage_request(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_provider text,
  p_model text,
  p_estimated_cost_cents integer,
  p_lease_token text,
  p_lease_seconds integer default 900
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
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_settlement record;
  v_lease_seconds integer;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid request hash';
  end if;
  if p_provider is null or btrim(p_provider) = ''
    or p_model is null or btrim(p_model) = ''
    or p_estimated_cost_cents is null or p_estimated_cost_cents < 0
    or p_lease_token is null or length(p_lease_token) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid managed usage reservation';
  end if;

  v_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));

  insert into public.managed_usage_requests (
    user_id,
    idempotency_key,
    request_hash,
    provider,
    model,
    estimated_cost_cents,
    lease_token,
    lease_expires_at
  ) values (
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_provider,
    p_model,
    p_estimated_cost_cents,
    p_lease_token,
    now() + make_interval(secs => v_lease_seconds)
  )
  on conflict (user_id, idempotency_key) do nothing;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage reservation unavailable';
  end if;

  -- The request body, provider, and model are immutable. Pricing can change
  -- between a lost-response retry and its replay; the original stored estimate
  -- remains authoritative and therefore is deliberately not a conflict field.
  if v_request.request_hash is distinct from p_request_hash
    or v_request.provider is distinct from p_provider
    or v_request.model is distinct from p_model then
    return query select
      'conflict'::text,
      v_request.status,
      null::text,
      v_request.estimated_cost_cents,
      v_request.reservation_settlement_status,
      'IDEMPOTENCY_CONFLICT'::text;
    return;
  end if;

  if v_request.status in ('completed', 'released', 'outcome_unknown', 'declined') then
    return query select
      v_request.status,
      v_request.status,
      null::text,
      v_request.estimated_cost_cents,
      coalesce(v_request.final_settlement_status, v_request.reservation_settlement_status),
      v_request.final_error_code;
    return;
  end if;

  if v_request.status in ('reserved', 'provider_started') then
    -- An inline retry uses the same lease token when the commit succeeded but
    -- its response was lost. A new/concurrent HTTP execution uses a different
    -- token and must never call the provider a second time.
    if v_request.lease_token = p_lease_token
      and v_request.lease_expires_at > now() then
      return query select
        'acquired'::text,
        'reserved'::text,
        v_request.lease_token,
        v_request.estimated_cost_cents,
        v_request.reservation_settlement_status,
        null::text;
    else
      return query select
        'in_progress'::text,
        v_request.status,
        null::text,
        v_request.estimated_cost_cents,
        v_request.reservation_settlement_status,
        null::text;
    end if;
    return;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement(
    p_user_id,
    v_request.estimated_cost_cents,
    'Managed usage reservation: ' || v_request.provider || '/' || v_request.model,
    jsonb_build_object(
      'type', 'managed_usage_reservation',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model
    ),
    'managed-reserve:' || v_request.id::text
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage reservation returned no result';
  end if;

  if v_settlement.settlement_status = 'succeeded'
    and v_settlement.deduction_success then
    update public.managed_usage_requests request_row
    set status = 'reserved',
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        reservation_settlement_status = 'succeeded',
        final_error_code = null,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'acquired'::text,
      'reserved'::text,
      p_lease_token,
      v_request.estimated_cost_cents,
      'succeeded'::text,
      null::text;
    return;
  end if;

  if v_settlement.settlement_status = 'pending' then
    update public.managed_usage_requests request_row
    set reservation_settlement_status = 'pending',
        final_error_code = v_settlement.error_code,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'unavailable'::text,
      'reserving'::text,
      null::text,
      v_request.estimated_cost_cents,
      'pending'::text,
      v_settlement.error_code;
    return;
  end if;

  update public.managed_usage_requests request_row
  set status = 'declined',
      reservation_settlement_status = 'terminal',
      final_error_code = coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS'),
      finalized_at = now(),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select
    'declined'::text,
    'declined'::text,
    null::text,
    v_request.estimated_cost_cents,
    'terminal'::text,
    coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS')::text;
end;
$$;

create or replace function public.extend_managed_usage_request_provider_step(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_operation_key text,
  p_estimated_cost_cents integer,
  p_session_cap_cents integer,
  p_weekly_cap_cents integer,
  p_flagship_weekly_cap_cents integer,
  p_is_flagship boolean
)
returns table(
  extension_decision text,
  request_status text,
  estimated_cost_cents integer,
  settlement_status text,
  error_code text
)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_extension public.managed_usage_request_extensions%rowtype;
  v_settlement record;
  v_session_used integer := 0;
  v_weekly_used integer := 0;
  v_flagship_weekly_used integer := 0;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_operation_key is null
    or p_operation_key !~ '^provider:[1-9][0-9]{0,8}$'
    or p_estimated_cost_cents is null or p_estimated_cost_cents < 0
    or (p_session_cap_cents is not null and p_session_cap_cents < 0)
    or (p_weekly_cap_cents is not null and p_weekly_cap_cents < 0)
    or (p_flagship_weekly_cap_cents is not null and p_flagship_weekly_cap_cents < 0)
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
      coalesce(v_request.estimated_cost_cents, 0)::integer,
      null::text,
      'STATE_CONFLICT'::text;
    return;
  end if;

  -- The original request reservation covers exactly the first provider
  -- operation reached under this lease. Persisting its stable key makes a
  -- workflow replay free while every later operation must extend the reserve.
  if v_request.initial_provider_operation_key is null then
    update public.managed_usage_requests request_row
    set initial_provider_operation_key = p_operation_key,
        updated_at = now()
    where request_row.id = v_request.id;

    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  if v_request.initial_provider_operation_key = p_operation_key then
    return query select
      'covered'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      v_request.reservation_settlement_status,
      null::text;
    return;
  end if;

  insert into public.managed_usage_request_extensions (
    request_id,
    user_id,
    operation_key,
    estimated_cost_cents
  ) values (
    v_request.id,
    p_user_id,
    p_operation_key,
    p_estimated_cost_cents
  ) on conflict (request_id, operation_key) do nothing;

  select extension_row.* into v_extension
  from public.managed_usage_request_extensions extension_row
  where extension_row.request_id = v_request.id
    and extension_row.operation_key = p_operation_key
  for update;

  if not found or v_extension.estimated_cost_cents is distinct from p_estimated_cost_cents then
    return query select
      'conflict'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      v_extension.settlement_status,
      'IDEMPOTENCY_CONFLICT'::text;
    return;
  end if;

  if v_extension.status = 'extended' then
    return query select
      'already_extended'::text,
      v_request.status,
      v_request.estimated_cost_cents,
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
      v_request.estimated_cost_cents,
      v_extension.settlement_status,
      v_extension.error_code;
    return;
  end if;

  select
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.created_at >= now() - interval '5 hours'
    ), 0)::integer,
    coalesce(sum(transaction_row.amount_cents), 0)::integer,
    coalesce(sum(transaction_row.amount_cents) filter (
      where transaction_row.metadata->>'is_flagship' = 'true'
    ), 0)::integer
  into v_session_used, v_weekly_used, v_flagship_weekly_used
  from public.credit_transactions transaction_row
  where transaction_row.user_id = p_user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.created_at >= now() - interval '7 days';

  if p_session_cap_cents is not null
    and v_session_used + p_estimated_cost_cents > p_session_cap_cents then
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'ROLLING_FIVE_HOUR_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'session_limit'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      null::text,
      'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
    return;
  end if;

  if p_weekly_cap_cents is not null
    and v_weekly_used + p_estimated_cost_cents > p_weekly_cap_cents then
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'ROLLING_WEEKLY_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'weekly_limit'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      null::text,
      'ROLLING_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_cents is not null
    and v_flagship_weekly_used + p_estimated_cost_cents > p_flagship_weekly_cap_cents then
    update public.managed_usage_request_extensions extension_row
    set status = 'declined',
        error_code = 'FLAGSHIP_WEEKLY_LIMIT_REACHED',
        updated_at = now()
    where extension_row.request_id = v_request.id
      and extension_row.operation_key = p_operation_key;

    return query select
      'flagship_weekly_limit'::text,
      v_request.status,
      v_request.estimated_cost_cents,
      null::text,
      'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement(
    p_user_id,
    p_estimated_cost_cents,
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
    set estimated_cost_cents = request_row.estimated_cost_cents + p_estimated_cost_cents,
        updated_at = now()
    where request_row.id = v_request.id
    returning request_row.estimated_cost_cents into v_request.estimated_cost_cents;

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
      v_request.estimated_cost_cents,
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
      v_request.estimated_cost_cents,
      'pending'::text,
      v_settlement.error_code;
    return;
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
    v_request.estimated_cost_cents,
    'terminal'::text,
    coalesce(v_settlement.error_code, 'INSUFFICIENT_CREDITS')::text;
end;
$$;

delete from public.schema_migrations
  where filename = '0178_managed_usage_lease_renewal.sql';

commit;
