-- 0066 — Race-safe rolling spend ceilings for paid Managed Cloud usage.
--
-- The UI quota check is advisory because provider cost is not known until the
-- server resolves the final route. This migration makes the existing durable
-- financial reservation authoritative: one tenant's reservations serialize,
-- the in-flight estimate is included before provider egress, and prior spend
-- remains in the trailing windows across plan upgrades.

alter table public.managed_usage_requests
  add column if not exists is_flagship boolean not null default false,
  add column if not exists initial_provider_operation_key text;

create table if not exists public.managed_usage_request_extensions (
  request_id uuid not null references public.managed_usage_requests(id) on delete cascade,
  user_id text not null,
  operation_key text not null check (length(operation_key) between 10 and 18),
  estimated_cost_cents integer not null check (estimated_cost_cents >= 0),
  status text not null default 'reserving'
    check (status = any (array['reserving', 'extended', 'declined'])),
  settlement_status text
    check (settlement_status is null or settlement_status = any (
      array['pending', 'succeeded', 'terminal']
    )),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, operation_key)
);

alter table public.managed_usage_request_extensions enable row level security;
alter table public.managed_usage_request_extensions force row level security;
drop policy if exists managed_usage_request_extensions_user_isolation
  on public.managed_usage_request_extensions;
create policy managed_usage_request_extensions_user_isolation
  on public.managed_usage_request_extensions
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.managed_usage_request_extensions from public;
grant select, insert, update on public.managed_usage_request_extensions to app_rls;

create index if not exists idx_credit_transactions_user_deduction_created
  on public.credit_transactions (user_id, created_at)
  include (amount_cents, metadata)
  where transaction_type = 'deduction';

-- Reconciliation rows must inherit the request's flagship classification.
-- Reservation rows are also relabeled by the wrapper below because the legacy
-- function inserts the request and its first ledger row in one call.
create or replace function public.label_managed_usage_transaction_flagship()
returns trigger
language plpgsql
as $$
declare
  v_is_flagship boolean;
begin
  if new.metadata ? 'managed_usage_request_id' then
    select request_row.is_flagship into v_is_flagship
    from public.managed_usage_requests request_row
    where request_row.user_id = new.user_id
      and request_row.id::text = new.metadata->>'managed_usage_request_id';

    if found then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object('is_flagship', v_is_flagship);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.label_managed_usage_transaction_flagship() from public;

drop trigger if exists label_managed_usage_transaction_flagship
  on public.credit_transactions;
create trigger label_managed_usage_transaction_flagship
  before insert on public.credit_transactions
  for each row execute function public.label_managed_usage_transaction_flagship();

-- Managed Cloud has its own authoritative rolling-window policy below. Keep
-- the durable settlement job/ledger owner from 0055, but do not send these
-- reservations through deduct_credits(): that legacy function still enforces
-- a calendar-day ceiling and mutates flagship_used_today_cents. This helper
-- performs only the billing-period balance mutation; the wrapper below owns
-- the rolling 5-hour, 7-day, and flagship-week admission decision.
create or replace function public.settle_managed_usage_credits(
  p_user_id text,
  p_amount_cents integer,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  success boolean,
  remaining_cents integer,
  error text,
  code text,
  daily_limit integer,
  daily_used integer,
  daily_remaining integer,
  reset_in_hours numeric
)
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining integer;
  v_request_id text;
  v_operation_key text;
  v_operation_type text;
  v_expected_key text;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_amount_cents is null then
    raise exception using errcode = '22023', message = 'managed usage amount is required';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 255 then
    raise exception using errcode = '22023', message = 'valid idempotency_key is required';
  end if;

  v_operation_type := coalesce(p_metadata->>'type', '');
  v_request_id := coalesce(p_metadata->>'managed_usage_request_id', '');
  v_operation_key := coalesce(p_metadata->>'operation_key', '');

  if v_operation_type not in (
    'managed_usage_reservation',
    'managed_usage_extension',
    'managed_usage_finalization',
    'managed_usage_outcome_unknown'
  ) or v_request_id = '' then
    raise exception using errcode = '22023', message = 'invalid managed usage settlement metadata';
  end if;

  v_expected_key := case
    when v_operation_type = 'managed_usage_reservation'
      then 'managed-reserve:' || v_request_id
    when v_operation_type = 'managed_usage_extension'
      and v_operation_key ~ '^provider:[1-9][0-9]{0,8}$'
      then 'managed-extend:' || v_request_id || ':' || v_operation_key
    else 'managed-final:' || v_request_id
  end;
  if p_idempotency_key is distinct from v_expected_key then
    raise exception using errcode = '22023', message = 'invalid managed usage settlement key';
  end if;
  if not exists (
    select 1
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.id::text = v_request_id
  ) then
    raise exception using errcode = '22023', message = 'managed usage request not found';
  end if;

  select key_row.result into v_existing_result
  from public.credit_idempotency_keys key_row
  where key_row.idempotency_key = p_idempotency_key
    and key_row.user_id = p_user_id
    and key_row.expires_at > now();

  if v_existing_result is not null then
    return query select
      (v_existing_result->>'success')::boolean,
      (v_existing_result->>'remaining_cents')::integer,
      v_existing_result->>'error',
      v_existing_result->>'code',
      0,
      0,
      0,
      0::numeric;
    return;
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.period_start <= now()
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1
  for update;

  if v_account is null then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', 0,
      'error', 'no active credit account found',
      'code', 'NO_ACCOUNT'
    );
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false, 0, 'no active credit account found'::text, 'NO_ACCOUNT'::text,
      0, 0, 0, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;

  if p_amount_cents > 0 and v_remaining < p_amount_cents then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'billing period credit limit exceeded',
      'code', 'BILLING_PERIOD_LIMIT_REACHED'
    );
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'billing period credit limit exceeded'::text,
      'BILLING_PERIOD_LIMIT_REACHED'::text,
      0, 0, 0, 0::numeric;
    return;
  end if;

  -- A negative reconciliation may only release a reservation that has already
  -- contributed to this billing-period ledger. Failing closed prevents a bad
  -- retry or forged payload from manufacturing account credit.
  if p_amount_cents < 0 and v_account.credits_used_cents < -p_amount_cents then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'managed usage release exceeds settled usage',
      'code', 'INVALID_MANAGED_USAGE_RELEASE'
    );
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'managed usage release exceeds settled usage'::text,
      'INVALID_MANAGED_USAGE_RELEASE'::text,
      0, 0, 0, 0::numeric;
    return;
  end if;

  update public.token_credits account_row
  set credits_used_cents = account_row.credits_used_cents + p_amount_cents,
      updated_at = now()
  where account_row.id = v_account.id;

  insert into public.credit_transactions (
    user_id,
    credit_account_id,
    transaction_type,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    v_account.id,
    'deduction',
    p_amount_cents,
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  v_result := jsonb_build_object(
    'success', true,
    'remaining_cents', v_remaining - p_amount_cents,
    'error', null,
    'code', null
  );
  insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
  values (p_idempotency_key, p_user_id, v_result)
  on conflict (idempotency_key) do nothing;

  return query select
    true,
    v_remaining - p_amount_cents,
    null::text,
    null::text,
    0, 0, 0, 0::numeric;
end;
$$;

revoke all on function public.settle_managed_usage_credits(
  text, integer, text, jsonb, text
) from public;
grant execute on function public.settle_managed_usage_credits(
  text, integer, text, jsonb, text
) to app_rls;

-- Preserve the single durable settlement queue while choosing the appropriate
-- balance policy at its execution boundary. Only lifecycle-owned metadata can
-- enter the managed helper; every other credit operation retains the legacy
-- deduction behavior until it is migrated independently.
create or replace function public.enqueue_credit_settlement(
  p_user_id text,
  p_amount_cents integer,
  p_description text,
  p_metadata jsonb,
  p_idempotency_key text
)
returns table(
  settlement_status text,
  deduction_success boolean,
  remaining_cents integer,
  error_code text,
  error_message text,
  attempts integer
)
language plpgsql
as $$
declare
  v_job public.credit_settlement_jobs%rowtype;
  v_deduction record;
  v_attempt integer;
  v_sqlstate text;
  v_message text;
  v_retryable boolean;
  v_terminal_code text;
  v_result jsonb;
begin
  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception using errcode = '22023', message = 'user_id is required';
  end if;
  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 255 then
    raise exception using errcode = '22023', message = 'valid idempotency_key is required';
  end if;

  insert into public.credit_settlement_jobs (
    user_id,
    idempotency_key,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    p_idempotency_key,
    p_amount_cents,
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key) do nothing;

  select job.* into v_job
  from public.credit_settlement_jobs job
  where job.user_id = p_user_id
    and job.idempotency_key = p_idempotency_key
  for update;

  if v_job.amount_cents is distinct from p_amount_cents
    or v_job.description is distinct from p_description
    or v_job.metadata is distinct from coalesce(p_metadata, '{}'::jsonb) then
    return query select
      'terminal'::text,
      false,
      null::integer,
      'IDEMPOTENCY_CONFLICT'::text,
      'idempotency key was reused with a different settlement payload'::text,
      v_job.attempt_count;
    return;
  end if;

  if v_job.status in ('succeeded', 'terminal') then
    return query select
      v_job.status,
      coalesce((v_job.result->>'success')::boolean, false),
      (v_job.result->>'remaining_cents')::integer,
      coalesce(v_job.result->>'code', v_job.last_error_code),
      coalesce(v_job.result->>'error', v_job.last_error),
      v_job.attempt_count;
    return;
  end if;

  if v_job.attempt_count >= 12 then
    update public.credit_settlement_jobs job
    set status = 'terminal',
        last_error_code = 'RETRY_EXHAUSTED',
        last_error = 'credit settlement retry budget exhausted',
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      null::integer,
      'RETRY_EXHAUSTED'::text,
      'credit settlement retry budget exhausted'::text,
      v_job.attempt_count;
    return;
  end if;

  update public.credit_settlement_jobs job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      last_error_code = null,
      last_error = null,
      updated_at = now()
  where job.id = v_job.id
  returning job.attempt_count into v_attempt;

  begin
    if coalesce(p_metadata->>'type', '') in (
      'managed_usage_reservation',
      'managed_usage_extension',
      'managed_usage_finalization',
      'managed_usage_outcome_unknown'
    ) then
      select deduction.* into v_deduction
      from public.settle_managed_usage_credits(
        p_user_id,
        p_amount_cents,
        p_description,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
      ) deduction;
    else
      select deduction.* into v_deduction
      from public.deduct_credits(
        p_user_id,
        p_amount_cents,
        p_description,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
      ) deduction;
    end if;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'credit settlement returned no result';
    end if;

    v_result := jsonb_build_object(
      'success', v_deduction.success,
      'remaining_cents', v_deduction.remaining_cents,
      'error', v_deduction.error,
      'code', v_deduction.code,
      'daily_limit', v_deduction.daily_limit,
      'daily_used', v_deduction.daily_used,
      'daily_remaining', v_deduction.daily_remaining,
      'reset_in_hours', v_deduction.reset_in_hours
    );

    if v_deduction.success then
      update public.credit_settlement_jobs job
      set status = 'succeeded',
          result = v_result,
          completed_at = now(),
          next_attempt_at = now(),
          updated_at = now()
      where job.id = v_job.id;

      return query select
        'succeeded'::text,
        true,
        v_deduction.remaining_cents,
        null::text,
        null::text,
        v_attempt;
      return;
    end if;

    update public.credit_settlement_jobs job
    set status = 'terminal',
        result = v_result,
        last_error_code = coalesce(v_deduction.code, 'DEDUCTION_REJECTED'),
        last_error = coalesce(v_deduction.error, 'credit deduction rejected'),
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      v_deduction.remaining_cents,
      coalesce(v_deduction.code, 'DEDUCTION_REJECTED'),
      coalesce(v_deduction.error, 'credit deduction rejected'),
      v_attempt;
    return;
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text;
    v_retryable := public.credit_retryable_sqlstate(v_sqlstate);

    if v_retryable and v_attempt < 12 then
      update public.credit_settlement_jobs job
      set status = 'pending',
          next_attempt_at = now()
            + least(
                interval '1 hour',
                interval '5 seconds'
                  * power(2::double precision, least(v_attempt - 1, 10)::double precision)
              ),
          last_error_code = v_sqlstate,
          last_error = v_message,
          updated_at = now()
      where job.id = v_job.id;

      return query select
        'pending'::text,
        false,
        null::integer,
        v_sqlstate,
        v_message,
        v_attempt;
      return;
    end if;

    v_terminal_code := case
      when v_retryable then 'RETRY_EXHAUSTED'
      else 'SQLSTATE_' || coalesce(v_sqlstate, 'UNKNOWN')
    end;

    update public.credit_settlement_jobs job
    set status = 'terminal',
        last_error_code = v_terminal_code,
        last_error = v_message,
        completed_at = now(),
        updated_at = now()
    where job.id = v_job.id;

    return query select
      'terminal'::text,
      false,
      null::integer,
      v_terminal_code,
      v_message,
      v_attempt;
    return;
  end;
end;
$$;

revoke all on function public.enqueue_credit_settlement(
  text, integer, text, jsonb, text
) from public;
grant execute on function public.enqueue_credit_settlement(
  text, integer, text, jsonb, text
) to app_rls;

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
  p_is_flagship boolean
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
  v_session_used integer := 0;
  v_weekly_used integer := 0;
  v_flagship_weekly_used integer := 0;
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

  if p_session_cap_cents > 0
    and v_session_used + p_estimated_cost_cents > p_session_cap_cents then
    return query select
      'session_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'ROLLING_FIVE_HOUR_LIMIT_REACHED'::text;
    return;
  end if;

  if p_weekly_cap_cents > 0
    and v_weekly_used + p_estimated_cost_cents > p_weekly_cap_cents then
    return query select
      'weekly_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'ROLLING_WEEKLY_LIMIT_REACHED'::text;
    return;
  end if;

  if p_is_flagship
    and p_flagship_weekly_cap_cents > 0
    and v_flagship_weekly_used + p_estimated_cost_cents > p_flagship_weekly_cap_cents then
    return query select
      'flagship_weekly_limit'::text,
      'declined'::text,
      null::text,
      p_estimated_cost_cents,
      null::text,
      'FLAGSHIP_WEEKLY_LIMIT_REACHED'::text;
    return;
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
      || jsonb_build_object('is_flagship', p_is_flagship)
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
$$;

revoke all on function public.reserve_managed_usage_request_with_limits(
  text, text, text, text, text, integer, text, integer, integer, integer, integer, boolean
) from public;
grant execute on function public.reserve_managed_usage_request_with_limits(
  text, text, text, text, text, integer, text, integer, integer, integer, integer, boolean
) to app_rls;

comment on function public.reserve_managed_usage_request_with_limits(
  text, text, text, text, text, integer, text, integer, integer, integer, integer, boolean
) is
  'Atomically enforces private rolling spend ceilings and delegates the durable managed usage lifecycle.';

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
    or p_session_cap_cents is null or p_session_cap_cents < 0
    or p_weekly_cap_cents is null or p_weekly_cap_cents < 0
    or p_flagship_weekly_cap_cents is null or p_flagship_weekly_cap_cents < 0
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

  if p_session_cap_cents > 0
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

  if p_weekly_cap_cents > 0
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
    and p_flagship_weekly_cap_cents > 0
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

revoke all on function public.extend_managed_usage_request_provider_step(
  text, text, text, text, text, integer, integer, integer, integer, boolean
) from public;
grant execute on function public.extend_managed_usage_request_provider_step(
  text, text, text, text, text, integer, integer, integer, integer, boolean
) to app_rls;

comment on function public.extend_managed_usage_request_provider_step(
  text, text, text, text, text, integer, integer, integer, integer, boolean
) is
  'Idempotently reserves each provider operation under the original tenant, request, lease, rolling caps, and billing-period balance.';
