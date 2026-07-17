-- 0056 — Durable managed-usage request lifecycle.
--
-- A managed provider call is an external side effect. This migration makes the
-- local financial side deterministic around that boundary:
--   1. reserve through the canonical credit settlement owner before egress;
--   2. persist provider-started before invoking the provider;
--   3. atomically persist provider success and the actual-cost delta;
--   4. record client delivery independently for audit/recovery;
--   5. if a lease expires without durable provider success, favor the customer
--      and refund exactly once as outcome_unknown. Provider work is never
--      replayed by recovery.

create table if not exists public.managed_usage_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  provider text not null,
  model text not null,
  estimated_cost_cents integer not null check (estimated_cost_cents >= 0),
  actual_cost_cents integer check (actual_cost_cents >= 0),
  status text not null default 'reserving'
    check (status = any (array[
      'reserving',
      'reserved',
      'provider_started',
      'completed',
      'released',
      'outcome_unknown',
      'declined'
    ])),
  lease_token text not null check (length(lease_token) between 1 and 128),
  lease_expires_at timestamptz not null,
  reservation_settlement_status text
    check (reservation_settlement_status is null or reservation_settlement_status = any (
      array['pending', 'succeeded', 'terminal']
    )),
  final_settlement_status text
    check (final_settlement_status is null or final_settlement_status = any (
      array['pending', 'succeeded', 'terminal']
    )),
  final_error_code text,
  usage jsonb not null default '{}'::jsonb,
  provider_started_at timestamptz,
  provider_succeeded_at timestamptz,
  client_delivered_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (length(idempotency_key) between 8 and 128)
);

create index if not exists idx_managed_usage_requests_stale
  on public.managed_usage_requests (lease_expires_at, created_at)
  where status in ('reserving', 'reserved', 'provider_started');

create index if not exists idx_managed_usage_requests_user_created
  on public.managed_usage_requests (user_id, created_at desc);

alter table public.managed_usage_requests enable row level security;
alter table public.managed_usage_requests force row level security;

drop policy if exists managed_usage_requests_user_isolation
  on public.managed_usage_requests;
create policy managed_usage_requests_user_isolation
  on public.managed_usage_requests
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.managed_usage_requests from public;
grant select, insert, update on public.managed_usage_requests to app_rls;

-- The legacy idempotency table predates RLS. Managed billing keys are internal,
-- but applying the same tenant boundary prevents a generic user-scoped query
-- from observing or colliding with another tenant's ledger keys.
alter table public.credit_idempotency_keys enable row level security;
alter table public.credit_idempotency_keys force row level security;
drop policy if exists credit_idempotency_keys_user_isolation
  on public.credit_idempotency_keys;
create policy credit_idempotency_keys_user_isolation
  on public.credit_idempotency_keys
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

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

revoke all on function public.reserve_managed_usage_request(
  text, text, text, text, text, integer, text, integer
) from public;
grant execute on function public.reserve_managed_usage_request(
  text, text, text, text, text, integer, text, integer
) to app_rls;

create or replace function public.mark_managed_usage_provider_started(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text
)
returns table(request_status text, operation_result text)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token then
    return query select 'unknown'::text, 'conflict'::text;
    return;
  end if;

  if v_request.status = 'provider_started' then
    return query select v_request.status, 'already_updated'::text;
    return;
  end if;
  if v_request.status <> 'reserved' or v_request.lease_expires_at <= now() then
    return query select v_request.status, 'conflict'::text;
    return;
  end if;

  update public.managed_usage_requests request_row
  set status = 'provider_started',
      provider_started_at = coalesce(request_row.provider_started_at, now()),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select 'provider_started'::text, 'updated'::text;
end;
$$;

revoke all on function public.mark_managed_usage_provider_started(text, text, text, text)
  from public;
grant execute on function public.mark_managed_usage_provider_started(text, text, text, text)
  to app_rls;

create or replace function public.finalize_managed_usage_request(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text,
  p_outcome text,
  p_actual_cost_cents integer,
  p_usage jsonb
)
returns table(
  request_status text,
  operation_result text,
  settlement_status text,
  actual_cost_cents integer,
  error_code text
)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_settlement record;
  v_delta integer;
  v_final_status text;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_outcome not in ('completed', 'failed')
    or p_actual_cost_cents is null or p_actual_cost_cents < 0 then
    raise exception using errcode = '22023', message = 'invalid managed usage finalization';
  end if;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token then
    return query select 'unknown'::text, 'conflict'::text, null::text, 0, 'STATE_CONFLICT'::text;
    return;
  end if;

  -- First terminal transition wins. Reordered/duplicate completion, failure,
  -- disconnect, and timeout callbacks can only observe the stored result.
  if v_request.status in ('completed', 'released', 'outcome_unknown') then
    return query select
      v_request.status,
      'already_finalized'::text,
      v_request.final_settlement_status,
      coalesce(v_request.actual_cost_cents, 0),
      v_request.final_error_code;
    return;
  end if;

  if v_request.status not in ('reserved', 'provider_started')
    or (p_outcome = 'completed' and v_request.status <> 'provider_started') then
    return query select
      v_request.status,
      'conflict'::text,
      v_request.final_settlement_status,
      coalesce(v_request.actual_cost_cents, 0),
      'STATE_CONFLICT'::text;
    return;
  end if;

  if p_outcome = 'completed' then
    v_delta := p_actual_cost_cents - v_request.estimated_cost_cents;
    v_final_status := 'completed';
  else
    v_delta := -v_request.estimated_cost_cents;
    v_final_status := 'released';
  end if;

  select settlement.* into v_settlement
  from public.enqueue_credit_settlement(
    p_user_id,
    v_delta,
    case
      when p_outcome = 'completed' then 'Managed usage actual-cost reconciliation'
      else 'Managed usage reservation release'
    end,
    jsonb_build_object(
      'type', 'managed_usage_finalization',
      'managed_usage_request_id', v_request.id,
      'provider', v_request.provider,
      'model', v_request.model,
      'outcome', p_outcome,
      'estimated_cost_cents', v_request.estimated_cost_cents,
      'actual_cost_cents', case when p_outcome = 'completed' then p_actual_cost_cents else 0 end,
      'usage', coalesce(p_usage, '{}'::jsonb)
    ),
    'managed-final:' || v_request.id::text
  ) settlement;

  if not found then
    raise exception using errcode = 'P0001', message = 'managed usage finalization returned no result';
  end if;

  update public.managed_usage_requests request_row
  set status = v_final_status,
      actual_cost_cents = case when p_outcome = 'completed' then p_actual_cost_cents else 0 end,
      usage = coalesce(p_usage, '{}'::jsonb),
      provider_succeeded_at = case
        when p_outcome = 'completed' then coalesce(request_row.provider_succeeded_at, now())
        else request_row.provider_succeeded_at
      end,
      final_settlement_status = v_settlement.settlement_status,
      final_error_code = v_settlement.error_code,
      finalized_at = now(),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select
    v_final_status,
    'finalized'::text,
    v_settlement.settlement_status,
    case when p_outcome = 'completed' then p_actual_cost_cents else 0 end,
    v_settlement.error_code;
end;
$$;

revoke all on function public.finalize_managed_usage_request(
  text, text, text, text, text, integer, jsonb
) from public;
grant execute on function public.finalize_managed_usage_request(
  text, text, text, text, text, integer, jsonb
) to app_rls;

create or replace function public.mark_managed_usage_client_delivered(
  p_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_lease_token text
)
returns table(request_status text, operation_result text)
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;

  select request_row.* into v_request
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.idempotency_key = p_idempotency_key
  for update;

  if not found
    or v_request.request_hash is distinct from p_request_hash
    or v_request.lease_token is distinct from p_lease_token then
    return query select 'unknown'::text, 'conflict'::text;
    return;
  end if;
  if v_request.status <> 'completed' then
    return query select v_request.status, 'conflict'::text;
    return;
  end if;
  if v_request.client_delivered_at is not null then
    return query select v_request.status, 'already_updated'::text;
    return;
  end if;

  update public.managed_usage_requests request_row
  set client_delivered_at = now(),
      updated_at = now()
  where request_row.id = v_request.id;

  return query select 'completed'::text, 'updated'::text;
end;
$$;

revoke all on function public.mark_managed_usage_client_delivered(text, text, text, text)
  from public;
grant execute on function public.mark_managed_usage_client_delivered(text, text, text, text)
  to app_rls;

-- Cron-only recovery. It never calls a provider and never takes over a lease.
-- Missing durable provider success means the customer is refunded, even if AGI
-- may have absorbed an unknowable partial upstream cost.
create or replace function public.recover_stale_managed_usage_requests(
  p_batch_size integer default 100
)
returns integer
language plpgsql
as $$
declare
  v_request public.managed_usage_requests%rowtype;
  v_reservation_status text;
  v_settlement record;
  v_recovered integer := 0;
begin
  for v_request in
    select request_row.*
    from public.managed_usage_requests request_row
    where request_row.status in ('reserving', 'reserved', 'provider_started')
      and request_row.lease_expires_at <= now()
    order by request_row.lease_expires_at, request_row.created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    -- A reserving row can have a durable settlement still pending. Do not
    -- enqueue the negative side before the positive side becomes terminal.
    if v_request.status = 'reserving' then
      select job.status into v_reservation_status
      from public.credit_settlement_jobs job
      where job.user_id = v_request.user_id
        and job.idempotency_key = 'managed-reserve:' || v_request.id::text;

      if v_reservation_status in ('pending', 'processing') then
        continue;
      end if;
      if v_reservation_status is null or v_reservation_status = 'terminal' then
        update public.managed_usage_requests request_row
        set status = 'outcome_unknown',
            actual_cost_cents = 0,
            final_settlement_status = v_reservation_status,
            final_error_code = 'OUTCOME_UNKNOWN_BEFORE_RESERVATION',
            finalized_at = now(),
            updated_at = now()
        where request_row.id = v_request.id;
        v_recovered := v_recovered + 1;
        continue;
      end if;
    end if;

    select settlement.* into v_settlement
    from public.enqueue_credit_settlement(
      v_request.user_id,
      -v_request.estimated_cost_cents,
      'Managed usage outcome-unknown reservation release',
      jsonb_build_object(
        'type', 'managed_usage_outcome_unknown',
        'managed_usage_request_id', v_request.id,
        'provider', v_request.provider,
        'model', v_request.model,
        'provider_started', v_request.provider_started_at is not null,
        'client_delivered', v_request.client_delivered_at is not null
      ),
      'managed-final:' || v_request.id::text
    ) settlement;

    update public.managed_usage_requests request_row
    set status = 'outcome_unknown',
        actual_cost_cents = 0,
        usage = '{}'::jsonb,
        final_settlement_status = v_settlement.settlement_status,
        final_error_code = coalesce(v_settlement.error_code, 'OUTCOME_UNKNOWN'),
        finalized_at = now(),
        updated_at = now()
    where request_row.id = v_request.id;
    v_recovered := v_recovered + 1;
  end loop;

  return v_recovered;
end;
$$;

revoke all on function public.recover_stale_managed_usage_requests(integer) from public;

-- Keep one scheduled recovery owner. The existing /api/cron/reconcile-credits
-- route invokes this function every minute through process_credit_settlement_queue.
create or replace function public.process_credit_settlement_queue(
  p_batch_size integer default 100
)
returns table(
  job_id uuid,
  settlement_status text,
  error_code text,
  attempts integer
)
language plpgsql
as $$
declare
  v_job public.credit_settlement_jobs%rowtype;
  v_settlement record;
begin
  perform public.recover_stale_managed_usage_requests(p_batch_size);

  for v_job in
    select job.*
    from public.credit_settlement_jobs job
    where status = 'pending'
      and next_attempt_at <= now()
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
    for update skip locked
  loop
    select settlement.* into v_settlement
    from public.enqueue_credit_settlement(
      v_job.user_id,
      v_job.amount_cents,
      v_job.description,
      v_job.metadata,
      v_job.idempotency_key
    ) settlement;

    return query select
      v_job.id,
      v_settlement.settlement_status,
      v_settlement.error_code,
      v_settlement.attempts;
  end loop;
end;
$$;

revoke all on function public.process_credit_settlement_queue(integer) from public;
