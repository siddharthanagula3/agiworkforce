-- Reversal of 0185 : take the microUSD unit back off the credit ledger.
--
-- WHAT THIS COSTS: every sub-cent balance recorded since 0185 applied is lost,
-- and the loss is silent rather than an error. The cents columns survive
-- because 0185 kept them written on every path, but they are round-half-up
-- mirrors: an account that spent 900 microUSD forty times carries 36,000
-- microUSD of real spend against a cents mirror of 4, and after this reversal
-- the 4 is all that is left. Balances are therefore correct to within half a
-- cent per account and no further.
--
-- The rolling 5-hour, weekly and flagship-weekly windows go back to summing
-- credit_transactions.amount_cents, where every sub-cent deduction rounded to
-- zero. A user whose entire week was sub-cent traffic reads as having spent
-- nothing, so those ceilings stop binding for that traffic until 0185 is
-- reapplied.
--
-- ROLLBACK ORDER. Deploy the cents-shaped application code FIRST, then run
-- this file. The reverse order leaves running code calling
-- reserve_managed_usage_request_with_limits_microusd, which this file drops,
-- and every managed turn fails closed with a 503.
--
-- SELF-CONTAINED. Every cents-shaped function 0185 turned into a wrapper is
-- restored here verbatim from the migration that last defined it, so the
-- reversal is one file and one transaction. No earlier migration needs
-- re-running.

begin;

-- Restore first, drop second: while this transaction runs, the wrappers must
-- never be pointing at a function that is already gone.

-- get_credit_balance, as defined by 0020_functions.sql.
create or replace function public.get_credit_balance(
  p_user_id text
)
returns table (
  account_id uuid,
  credits_allocated_cents integer,
  credits_used_cents integer,
  credits_remaining_cents integer,
  daily_limit_cents integer,
  daily_used_cents integer,
  daily_remaining_cents integer,
  period_start timestamptz,
  period_end timestamptz,
  last_daily_reset_at timestamptz
)
language plpgsql
as $$
declare
  v_account record;
  v_daily_limit integer;
  v_daily_used integer;
  v_remaining integer;
  v_needs_reset boolean;
begin
  select tc.* into v_account
  from public.token_credits tc
  where tc.user_id = p_user_id
    and tc.period_end > now()
  order by tc.period_end desc
  limit 1;

  if v_account is null then
    return query select
      null::uuid, 0, 0, 0, 0, 0, 0,
      null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);

  -- Daily reset check: flagship_cap_reset_date is a date column.
  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_daily_used := 0;
  else
    v_daily_used := coalesce(v_account.flagship_used_today_cents, 0);
  end if;

  return query select
    v_account.id,
    v_account.credits_allocated_cents,
    v_account.credits_used_cents,
    v_remaining,
    v_daily_limit,
    v_daily_used,
    greatest(0, v_daily_limit - v_daily_used),
    v_account.period_start,
    v_account.period_end,
    coalesce(
      (v_account.flagship_cap_reset_date::text)::timestamptz,
      now()
    );
end;
$$;

-- check_credits_available, as defined by 0020_functions.sql.
create or replace function public.check_credits_available(
  p_user_id text,
  p_amount_cents integer
)
returns boolean
language plpgsql
as $$
declare
  v_balance record;
begin
  select * into v_balance
  from public.get_credit_balance(p_user_id);

  if v_balance.credits_remaining_cents < p_amount_cents then
    return false;
  end if;

  if v_balance.daily_remaining_cents < p_amount_cents then
    return false;
  end if;

  return true;
end;
$$;

-- get_or_create_credit_account, as defined by 0020_functions.sql.
create or replace function public.get_or_create_credit_account(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
  from public.token_credits
  where user_id = p_user_id
    and subscription_id = p_subscription_id
    and period_start = p_period_start
    and period_end = p_period_end;

  if v_account_id is not null then
    return v_account_id;
  end if;

  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    credits_used_cents,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) values (
    p_user_id, v_account_id, 'allocation', p_credits_allocated_cents,
    'initial credit allocation for billing period'
  );

  return v_account_id;
end;
$$;

-- handle_refund, as defined by 0020_functions.sql.
create or replace function public.handle_refund(
  p_user_id text,
  p_refund_amount_cents integer,
  p_reason text default 'Refund processed'
)
returns boolean
language plpgsql
as $$
declare
  v_account record;
  v_credits_to_revoke integer;
  v_remaining integer;
begin
  select * into v_account
  from public.token_credits
  where user_id = p_user_id
  order by period_end desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_credits_to_revoke := least(p_refund_amount_cents, greatest(0, v_remaining));

  -- Increase used_cents to shrink the effective remaining balance.
  update public.token_credits
  set credits_used_cents = credits_used_cents + v_credits_to_revoke,
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) values (
    p_user_id, v_account.id, -v_credits_to_revoke, 'refund', p_reason
  );

  return true;
end;
$$;

-- deduct_credits, as defined by 0020_functions.sql.
create or replace function public.deduct_credits(
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
  v_account record;
  v_daily_limit integer;
  v_needs_reset boolean;
  v_hours_until_reset numeric;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining integer;
begin
  -- Idempotency check.
  if p_idempotency_key is not null then
    select result into v_existing_result
    from public.credit_idempotency_keys
    where idempotency_key = p_idempotency_key
      and user_id = p_user_id
      and expires_at > now();

    if v_existing_result is not null then
      return query select
        (v_existing_result->>'success')::boolean,
        (v_existing_result->>'remaining_cents')::integer,
        v_existing_result->>'error',
        v_existing_result->>'code',
        (v_existing_result->>'daily_limit')::integer,
        (v_existing_result->>'daily_used')::integer,
        (v_existing_result->>'daily_remaining')::integer,
        (v_existing_result->>'reset_in_hours')::numeric;
      return;
    end if;
  end if;

  -- Lock the active-period credit row.
  select tc.* into v_account
  from public.token_credits tc
  where tc.user_id = p_user_id
    and tc.period_end > now()
  order by tc.period_end desc
  limit 1
  for update;

  if v_account is null then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', 0,
      'error', 'no active credit account found',
      'code', 'NO_ACCOUNT',
      'daily_limit', 0,
      'daily_used', 0,
      'daily_remaining', 0,
      'reset_in_hours', 0
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select false, 0, 'no active credit account found'::text,
      'NO_ACCOUNT'::text, 0, 0, 0, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_cents - v_account.credits_used_cents;
  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);

  -- Daily reset via flagship_cap_reset_date (date column, resets at midnight UTC).
  v_needs_reset := v_account.flagship_cap_reset_date is null
    or v_account.flagship_cap_reset_date < current_date;

  if v_needs_reset then
    update public.token_credits
    set flagship_used_today_cents = 0,
        flagship_cap_reset_date = current_date,
        updated_at = now()
    where id = v_account.id;
    v_account.flagship_used_today_cents := 0;
    v_account.flagship_cap_reset_date := current_date;
  end if;

  -- Hours until next midnight UTC.
  v_hours_until_reset := extract(epoch from
    ((current_date + 1)::timestamptz - now())
  ) / 3600.0;

  -- Daily limit check.
  if coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents > v_daily_limit then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'daily credit limit exceeded',
      'code', 'DAILY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', coalesce(v_account.flagship_used_today_cents, 0),
      'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      'reset_in_hours', greatest(0, v_hours_until_reset)
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'daily credit limit exceeded'::text, 'DAILY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, coalesce(v_account.flagship_used_today_cents, 0),
      greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  -- Monthly limit check.
  if v_remaining < p_amount_cents then
    v_result := jsonb_build_object(
      'success', false,
      'remaining_cents', v_remaining,
      'error', 'monthly credit limit exceeded',
      'code', 'MONTHLY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', coalesce(v_account.flagship_used_today_cents, 0),
      'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      'reset_in_hours', greatest(0, v_hours_until_reset)
    );

    if p_idempotency_key is not null then
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;
    end if;

    return query select
      false, v_remaining,
      'monthly credit limit exceeded'::text, 'MONTHLY_CREDIT_LIMIT_REACHED'::text,
      v_daily_limit, coalesce(v_account.flagship_used_today_cents, 0),
      greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0)),
      greatest(0::numeric, v_hours_until_reset);
    return;
  end if;

  -- Perform atomic deduction.
  update public.token_credits
  set credits_used_cents = credits_used_cents + p_amount_cents,
      flagship_used_today_cents = coalesce(flagship_used_today_cents, 0) + p_amount_cents,
      updated_at = now()
  where id = v_account.id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) values (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description,
    case when p_idempotency_key is not null
      then coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key)
      else coalesce(p_metadata, '{}'::jsonb)
    end
  );

  v_result := jsonb_build_object(
    'success', true,
    'remaining_cents', v_remaining - p_amount_cents,
    'error', null,
    'code', null,
    'daily_limit', v_daily_limit,
    'daily_used', coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents,
    'daily_remaining', greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0) - p_amount_cents),
    'reset_in_hours', greatest(0, v_hours_until_reset)
  );

  if p_idempotency_key is not null then
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
  end if;

  return query select
    true, v_remaining - p_amount_cents,
    null::text, null::text,
    v_daily_limit,
    coalesce(v_account.flagship_used_today_cents, 0) + p_amount_cents,
    greatest(0, v_daily_limit - coalesce(v_account.flagship_used_today_cents, 0) - p_amount_cents),
    greatest(0::numeric, v_hours_until_reset);
end;
$$;

-- add_credits, as defined by 0111_credit_top_up_carry.sql.
create or replace function public.add_credits(
  p_user_id text,
  p_account_id uuid,
  p_amount_cents integer,
  p_description text,
  p_transaction_type text default 'purchase'
)
returns void
language plpgsql
as $$
begin
  if p_amount_cents <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_transaction_type not in ('purchase', 'adjustment', 'refund', 'bonus') then
    raise exception 'invalid transaction type: %', p_transaction_type;
  end if;

  update public.token_credits
  set credits_allocated_cents = credits_allocated_cents + p_amount_cents,
      top_up_allocated_cents = top_up_allocated_cents
        + case when p_transaction_type = 'purchase' then p_amount_cents else 0 end,
      credits_used_cents = greatest(0, credits_used_cents),
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'credit account not found for user';
  end if;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) values (
    p_user_id, p_account_id, p_amount_cents, p_transaction_type, p_description
  );
end;
$$;

-- handle_top_up_refund, as defined by 0111_credit_top_up_carry.sql.
create or replace function public.handle_top_up_refund(
  p_user_id text,
  p_refund_amount_cents integer,
  p_reason text default 'Top-up refund processed'
)
returns boolean
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_remaining_cents integer;
  v_balance_to_revoke integer;
  v_purchase_to_retire integer;
begin
  if p_refund_amount_cents <= 0 then
    raise exception 'refund amount must be positive';
  end if;

  select account.* into v_account
  from public.token_credits account
  where account.user_id = p_user_id
  order by account.period_end desc
  limit 1
  for update;

  if v_account.id is null then
    return false;
  end if;

  v_remaining_cents := greatest(
    v_account.credits_allocated_cents - v_account.credits_used_cents,
    0
  );
  v_balance_to_revoke := least(p_refund_amount_cents, v_remaining_cents);
  v_purchase_to_retire := least(p_refund_amount_cents, v_account.top_up_allocated_cents);

  update public.token_credits
  set credits_used_cents = credits_used_cents + v_balance_to_revoke,
      top_up_allocated_cents = top_up_allocated_cents - v_purchase_to_retire,
      updated_at = now()
  where id = v_account.id;

  -- Record the actual refunded purchase value, not merely the unspent amount,
  -- so repeated/partial Stripe refund events remain idempotent after usage.
  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description, metadata
  ) values (
    p_user_id,
    v_account.id,
    -p_refund_amount_cents,
    'refund',
    p_reason,
    jsonb_build_object(
      'top_up_refund', true,
      'balance_revoked_cents', v_balance_to_revoke,
      'purchase_retired_cents', v_purchase_to_retire
    )
  );

  return true;
end;
$$;

-- reset_credits_for_period, as defined by 0111_credit_top_up_carry.sql.
create or replace function public.reset_credits_for_period(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_cents integer
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
  v_previous public.token_credits%rowtype;
  v_remaining_cents integer := 0;
  v_unexpired_purchases_cents integer := 0;
  v_carried_top_up_cents integer := 0;
begin
  -- A repeated renewal webhook is a no-op. The old ON CONFLICT branch reset
  -- credits_used_cents to zero and could manufacture a second full allowance.
  select id into v_account_id
  from public.token_credits
  where user_id = p_user_id
    and subscription_id = p_subscription_id
    and period_start = p_period_start
    and period_end = p_period_end
  limit 1;
  if v_account_id is not null then
    return v_account_id;
  end if;

  select account.* into v_previous
  from public.token_credits account
  where account.user_id = p_user_id
    and account.subscription_id = p_subscription_id
    and account.period_start < p_period_start
  order by account.period_end desc
  limit 1
  for update;

  if v_previous.id is not null then
    v_remaining_cents := greatest(
      v_previous.credits_allocated_cents - v_previous.credits_used_cents,
      0
    );

    -- Purchases are consumed after included plan allowance (FIFO in aggregate).
    -- At a period boundary, remaining purchased balance therefore cannot exceed
    -- either the prior purchased allocation, the prior total balance, or the
    -- original value of purchases made in the preceding 12 months.
    select coalesce(sum(purchase_row.amount_cents), 0)::integer
      into v_unexpired_purchases_cents
    from public.credit_transactions purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.transaction_type = 'purchase'
      and purchase_row.amount_cents > 0
      and purchase_row.created_at > p_period_start - interval '12 months';

    v_carried_top_up_cents := least(
      v_previous.top_up_allocated_cents,
      v_remaining_cents,
      v_unexpired_purchases_cents
    );
  end if;

  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    top_up_allocated_cents,
    credits_used_cents,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents + v_carried_top_up_cents,
    v_carried_top_up_cents,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) values (
    p_user_id,
    v_account_id,
    'reset',
    p_credits_allocated_cents + v_carried_top_up_cents,
    'credit reset for new billing period',
    jsonb_build_object('carried_top_up_cents', v_carried_top_up_cents)
  );

  return v_account_id;
end;
$$;

-- settle_managed_usage_credits, as defined by 0066_managed_usage_rolling_caps.sql.
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

-- enqueue_credit_settlement, as defined by 0066_managed_usage_rolling_caps.sql.
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

-- reserve_managed_usage_request, as defined by 0178_managed_usage_lease_renewal.sql.
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

  -- The initial window a caller may hold before the first provider step
  -- renews it. 3600 was below the length of a single long provider call, so an
  -- agentic turn that asked for 86400 went stale mid-call and was refunded
  -- while the provider bill kept running. The absolute ceiling on renewal, not
  -- this number, is what stops a wedged turn.
  v_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 900), 21600));

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
      -- The retry is proof the turn is still being executed, so it renews the
      -- window the same way a provider step does. Without this a lost response
      -- late in a long turn re-acquired a lease that was about to expire.
      update public.managed_usage_requests request_row
      set lease_expires_at = least(
            greatest(
              request_row.lease_expires_at,
              now() + make_interval(secs => 3600)
            ),
            request_row.created_at + make_interval(secs => 86400)
          ),
          updated_at = now()
      where request_row.id = v_request.id;

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

-- reserve_managed_usage_request_with_limits, as defined by 0152_restore_null_tolerant_usage_caps.sql.
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

-- extend_managed_usage_request_provider_step, as defined by 0178_managed_usage_lease_renewal.sql.
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

  -- AGI-1. Reaching here proves the turn is still executing: the row is
  -- provider_started, the lease token matches and the lease has not expired.
  -- Nothing renewed it, so a turn whose provider steps ran past the reserved
  -- window was reclaimed as stale, refunded to the user, and then finalized
  -- into 'already_finalized' where no caller looks. AGI absorbed the real
  -- provider cost and billed nothing.
  --
  -- greatest() never shortens a longer window a caller reserved up front.
  -- least() holds the absolute ceiling measured from creation, so a wedged
  -- turn still expires and still recovers however many steps it emits.
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
  returning request_row.lease_expires_at into v_request.lease_expires_at;

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

-- finalize_managed_usage_request, as defined by 0056_managed_usage_request_lifecycle.sql.
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

-- recover_stale_managed_usage_requests, as defined by 0056_managed_usage_request_lifecycle.sql.
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

-- process_credit_settlement_queue, as defined by 0056_managed_usage_request_lifecycle.sql.
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

drop function if exists public.reserve_managed_usage_request_with_limits_microusd(
  text, text, text, text, text, bigint, text, integer, bigint, bigint, bigint, boolean, bigint
);
drop function if exists public.extend_managed_usage_request_provider_step_microusd(
  text, text, text, text, text, bigint, bigint, bigint, bigint, boolean
);
drop function if exists public.finalize_managed_usage_request_microusd(
  text, text, text, text, text, bigint, jsonb
);
drop function if exists public.reserve_managed_usage_request_microusd(
  text, text, text, text, text, bigint, text, integer
);
drop function if exists public.enqueue_credit_settlement_microusd(text, bigint, text, jsonb, text);
drop function if exists public.settle_managed_usage_credits_microusd(
  text, bigint, text, jsonb, text
);
drop function if exists public.deduct_credits_microusd(text, bigint, text, jsonb, text);
drop function if exists public.reset_credits_for_period_microusd(
  text, uuid, timestamptz, timestamptz, bigint
);
drop function if exists public.get_or_create_credit_account_microusd(
  text, uuid, timestamptz, timestamptz, bigint
);
drop function if exists public.handle_top_up_refund_microusd(text, bigint, text);
drop function if exists public.handle_refund_microusd(text, bigint, text);
drop function if exists public.add_credits_microusd(text, uuid, bigint, text, text);
drop function if exists public.check_credits_available_microusd(text, bigint);
drop function if exists public.get_credit_balance_microusd(text);
drop function if exists public.calculate_daily_limit_microusd(bigint);
drop function if exists public.build_settlement_result(
  boolean, bigint, text, text, bigint, bigint, bigint, numeric
);
drop function if exists public.settlement_result_microusd(jsonb, text, text);

alter table public.token_credits
  drop constraint if exists token_credits_top_up_allocation_valid_microusd;
alter table public.managed_usage_requests
  drop constraint if exists managed_usage_requests_microusd_non_negative;
alter table public.managed_usage_request_extensions
  drop constraint if exists managed_usage_request_extensions_microusd_non_negative;

alter table public.token_credits
  drop column if exists credits_allocated_microusd,
  drop column if exists credits_used_microusd,
  drop column if exists top_up_allocated_microusd,
  drop column if exists flagship_used_today_microusd;

alter table public.credit_transactions
  drop column if exists amount_microusd;

alter table public.managed_usage_requests
  drop column if exists estimated_cost_microusd,
  drop column if exists actual_cost_microusd;

alter table public.managed_usage_request_extensions
  drop column if exists estimated_cost_microusd;

alter table public.credit_settlement_jobs
  drop column if exists amount_microusd;

drop function if exists public.microusd_to_cents_mirror(bigint);

delete from public.schema_migrations
  where filename = '0185_managed_usage_microusd_ledger.sql';

commit;
