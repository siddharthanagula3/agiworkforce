-- Reversal of 0415: settle_managed_usage_credits_microusd goes back to its
-- 0182 body.
--
-- WHAT THIS COSTS: a reservation released after the billing period it was
-- taken in has renewed is checked against the new account's usage again. It
-- is refused with INVALID_MANAGED_USAGE_RELEASE when that usage is smaller,
-- the request is still marked released, and the purchased credit the
-- reservation held is not carried forward; when it is larger, the release is
-- taken off new-period usage instead. Ledger rows and balances written while
-- 0415 was applied stay as they are.

begin;

create or replace function public.settle_managed_usage_credits_microusd(
  p_user_id text,
  p_amount_microusd bigint,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table(
  success boolean,
  remaining_microusd bigint,
  error text,
  code text,
  daily_limit_microusd bigint,
  daily_used_microusd bigint,
  daily_remaining_microusd bigint,
  reset_in_hours numeric
)
language plpgsql
as $$
declare
  v_account public.token_credits%rowtype;
  v_existing_result jsonb;
  v_result jsonb;
  v_remaining bigint;
  v_request_id text;
  v_operation_key text;
  v_operation_type text;
  v_expected_key text;
begin
  if p_user_id is null
    or p_user_id is distinct from public.current_app_user_id() then
    raise exception using errcode = '42501', message = 'managed usage tenant mismatch';
  end if;
  if p_amount_microusd is null then
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
      public.settlement_result_microusd(v_existing_result, 'remaining_microusd', 'remaining_cents'),
      v_existing_result->>'error',
      v_existing_result->>'code',
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
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
    v_result := public.build_settlement_result(false, 0, 'no active credit account found',
      'NO_ACCOUNT', 0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false, 0::bigint, 'no active credit account found'::text, 'NO_ACCOUNT'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  v_remaining := v_account.credits_allocated_microusd - v_account.credits_used_microusd;

  if p_amount_microusd > 0 and v_remaining < p_amount_microusd then
    v_result := public.build_settlement_result(false, v_remaining,
      'billing period credit limit exceeded', 'BILLING_PERIOD_LIMIT_REACHED',
      0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'billing period credit limit exceeded'::text,
      'BILLING_PERIOD_LIMIT_REACHED'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  -- A negative reconciliation may only release a reservation that has already
  -- contributed to this billing-period ledger. Failing closed prevents a bad
  -- retry or forged payload from manufacturing account credit.
  if p_amount_microusd < 0 and v_account.credits_used_microusd < -p_amount_microusd then
    v_result := public.build_settlement_result(false, v_remaining,
      'managed usage release exceeds settled usage', 'INVALID_MANAGED_USAGE_RELEASE',
      0, 0, 0, 0::numeric);
    insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
    values (p_idempotency_key, p_user_id, v_result)
    on conflict (idempotency_key) do nothing;
    return query select
      false,
      v_remaining,
      'managed usage release exceeds settled usage'::text,
      'INVALID_MANAGED_USAGE_RELEASE'::text,
      0::bigint, 0::bigint, 0::bigint, 0::numeric;
    return;
  end if;

  update public.token_credits account_row
  set credits_used_microusd = account_row.credits_used_microusd + p_amount_microusd,
      credits_used_cents = public.microusd_to_cents_mirror(
        account_row.credits_used_microusd + p_amount_microusd
      ),
      updated_at = now()
  where account_row.id = v_account.id;

  insert into public.credit_transactions (
    user_id,
    credit_account_id,
    transaction_type,
    amount_microusd,
    amount_cents,
    description,
    metadata
  ) values (
    p_user_id,
    v_account.id,
    'deduction',
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_description,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  v_result := public.build_settlement_result(true, v_remaining - p_amount_microusd, null, null,
    0, 0, 0, 0::numeric);
  insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
  values (p_idempotency_key, p_user_id, v_result)
  on conflict (idempotency_key) do nothing;

  return query select
    true,
    v_remaining - p_amount_microusd,
    null::text,
    null::text,
    0::bigint, 0::bigint, 0::bigint, 0::numeric;
end;
$$;

revoke all on function public.settle_managed_usage_credits_microusd(
  text, bigint, text, jsonb, text
) from public;
grant execute on function public.settle_managed_usage_credits_microusd(
  text, bigint, text, jsonb, text
) to app_rls;

delete from public.schema_migrations
 where filename = '0415_release_after_renewal_restores_purchased_carry.sql';

commit;
