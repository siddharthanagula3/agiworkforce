-- =============================================================================
-- Migration 0415: a release after renewal settles against the account the
--                 request debited and carries its purchased credit forward
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : settle_managed_usage_credits_microusd (0182) applied every
--          adjustment to whichever account was active when it ran. A request
--          reserved before a renewal debited the old account, and the renewal
--          carried only the purchased balance left after that debit. When the
--          provider then failed, the release of the estimate was checked
--          against the new account's usage, usually zero, and refused with
--          INVALID_MANAGED_USAGE_RELEASE. The settlement job went terminal, the
--          request was marked released, and the purchased credit the
--          reservation had held was never carried forward
--          (PREPAID-ROLLOVER-02). When the new account already had usage, the
--          same release was instead taken off new-period usage, returning
--          ended-period plan allowance as new-period credit.
--
-- Shape  : the function keeps its 0182 body, signature and grants. One block
--          runs for a negative amount only. It sums the request's deduction
--          rows per account. When the release is larger than what the request
--          settled on the active account and the request also settled on an
--          earlier account, the release is split: the active account's share
--          lowers its usage as before, and the rest lowers the earlier
--          account's usage, newest earlier account first, never beyond what
--          the request settled there or that account's usage. For each earlier
--          account the purchased credit its renewal would have carried had the
--          release come first, least(top-up, allocated - used) after minus
--          before, is moved to the active account as top-up, capped by the
--          earlier account's top-up less what its renewal already carried
--          (from_credit_account_id on the reset row, written by 0414). If the
--          release cannot be placed the call fails closed with
--          INVALID_MANAGED_USAGE_RELEASE, as before. A release that fits the
--          active account, every positive amount, and every request that
--          never crossed a renewal take the unchanged 0182 path.
--
--          Ledger rows: the earlier account gets a deduction row of type
--          managed_usage_prior_period_release (settlement_type keeps the
--          caller's type) and, when credit moves, an adjustment pair of type
--          managed_usage_prior_period_carry with purchased_credit_event
--          release_carry_out / release_carry_in. Each derived row carries its
--          own idempotency_key and the caller's as settlement_idempotency_key.
--          Adjustments, not 'reset' rows, so no rolling window restarts. The
--          caller's row is written last, on the active account, so the
--          overage draw trigger still fires once over the request's net.
--
-- Empty  : no rows are rewritten. Releases that already went terminal with
--          INVALID_MANAGED_USAGE_RELEASE are not reopened; re-queueing them
--          returns money and is decided apart.
--
-- Depends: 0182 (settle_managed_usage_credits_microusd, credit_transactions
--          microUSD columns), 0066 (idx_credit_transactions_user_deduction_created),
--          0281 (request classification labels), 0298 (top-up provenance and
--          idx_credit_transactions_purchased_credit_event), 0414 (reset rows
--          record from_credit_account_id)
-- =============================================================================

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
  v_request_created_at timestamptz;
  v_active_settled bigint;
  v_prior_settled bigint;
  v_active_release bigint;
  v_prior_release bigint;
  v_left bigint;
  v_take bigint;
  v_carried bigint;
  v_restore bigint;
  v_restored bigint := 0;
  v_index integer;
  v_prior record;
  v_prior_account public.token_credits%rowtype;
  v_prior_ids uuid[] := array[]::uuid[];
  v_prior_takes bigint[] := array[]::bigint[];
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

  -- A release lowers usage on the active account up to what this request
  -- settled there, and the rest on the earlier accounts it settled on before a
  -- renewal. Purchased credit a renewal left behind because of that earlier
  -- debit is carried forward again; plan allowance of an ended period is not.
  if p_amount_microusd < 0 then
    select request_row.created_at into v_request_created_at
    from public.managed_usage_requests request_row
    where request_row.user_id = p_user_id
      and request_row.id::text = v_request_id;

    select
      coalesce(sum(transaction_row.amount_microusd) filter (
        where transaction_row.credit_account_id = v_account.id
      ), 0)::bigint,
      coalesce(sum(transaction_row.amount_microusd) filter (
        where transaction_row.credit_account_id <> v_account.id
      ), 0)::bigint
    into v_active_settled, v_prior_settled
    from public.credit_transactions transaction_row
    where transaction_row.user_id = p_user_id
      and transaction_row.transaction_type = 'deduction'
      and transaction_row.created_at >= v_request_created_at
      and transaction_row.metadata->>'managed_usage_request_id' = v_request_id;

    v_prior_release := least(
      greatest(-p_amount_microusd - greatest(v_active_settled, 0), 0),
      greatest(v_prior_settled, 0)
    );

    if v_prior_release > 0 then
      v_active_release := -p_amount_microusd - v_prior_release;

      perform 1
      from public.token_credits account_row
      where account_row.user_id = p_user_id
        and account_row.id <> v_account.id
        and account_row.id in (
          select transaction_row.credit_account_id
          from public.credit_transactions transaction_row
          where transaction_row.user_id = p_user_id
            and transaction_row.transaction_type = 'deduction'
            and transaction_row.created_at >= v_request_created_at
            and transaction_row.metadata->>'managed_usage_request_id' = v_request_id
        )
      order by account_row.id
      for update;

      v_left := v_prior_release;
      for v_prior in
        select settled.account_id,
               least(settled.settled_microusd, account_row.credits_used_microusd)
                 as releasable_microusd
        from (
          select transaction_row.credit_account_id as account_id,
                 sum(transaction_row.amount_microusd)::bigint as settled_microusd
          from public.credit_transactions transaction_row
          where transaction_row.user_id = p_user_id
            and transaction_row.transaction_type = 'deduction'
            and transaction_row.created_at >= v_request_created_at
            and transaction_row.metadata->>'managed_usage_request_id' = v_request_id
            and transaction_row.credit_account_id <> v_account.id
          group by transaction_row.credit_account_id
        ) settled
        join public.token_credits account_row on account_row.id = settled.account_id
        where settled.settled_microusd > 0
        order by account_row.period_end desc, account_row.id
      loop
        exit when v_left = 0;
        v_take := least(v_left, greatest(v_prior.releasable_microusd, 0));
        if v_take > 0 then
          v_prior_ids := v_prior_ids || v_prior.account_id;
          v_prior_takes := v_prior_takes || v_take;
          v_left := v_left - v_take;
        end if;
      end loop;

      if v_left > 0 or v_account.credits_used_microusd < v_active_release then
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

      for v_index in 1 .. coalesce(array_length(v_prior_ids, 1), 0) loop
        select account_row.* into v_prior_account
        from public.token_credits account_row
        where account_row.id = v_prior_ids[v_index];
        v_take := v_prior_takes[v_index];

        v_restore := least(
            v_prior_account.top_up_allocated_microusd,
            greatest(
              v_prior_account.credits_allocated_microusd
                - v_prior_account.credits_used_microusd + v_take,
              0
            )
          )
          - least(
            v_prior_account.top_up_allocated_microusd,
            greatest(
              v_prior_account.credits_allocated_microusd
                - v_prior_account.credits_used_microusd,
              0
            )
          );

        select coalesce(sum((transaction_row.metadata->>'carried_top_up_microusd')::bigint), 0)::bigint
        into v_carried
        from public.credit_transactions transaction_row
        where transaction_row.credit_account_id = v_account.id
          and transaction_row.transaction_type = 'reset'
          and transaction_row.metadata->>'from_credit_account_id' = v_prior_account.id::text;

        v_restore := least(
          v_restore,
          greatest(v_prior_account.top_up_allocated_microusd - v_carried, 0)
        );

        update public.token_credits account_row
        set credits_used_microusd = account_row.credits_used_microusd - v_take,
            credits_used_cents = public.microusd_to_cents_mirror(
              account_row.credits_used_microusd - v_take
            ),
            credits_allocated_microusd = account_row.credits_allocated_microusd - v_restore,
            credits_allocated_cents = public.microusd_to_cents_mirror(
              account_row.credits_allocated_microusd - v_restore
            ),
            top_up_allocated_microusd = account_row.top_up_allocated_microusd - v_restore,
            top_up_allocated_cents = public.microusd_to_cents_mirror(
              account_row.top_up_allocated_microusd - v_restore
            ),
            updated_at = now()
        where account_row.id = v_prior_account.id;

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
          v_prior_account.id,
          'deduction',
          -v_take,
          public.microusd_to_cents_mirror(-v_take),
          p_description,
          coalesce(p_metadata, '{}'::jsonb)
            || jsonb_build_object(
                 'type', 'managed_usage_prior_period_release',
                 'settlement_type', v_operation_type,
                 'settlement_idempotency_key', p_idempotency_key,
                 'idempotency_key',
                   p_idempotency_key || ':prior:' || v_prior_account.id::text
               )
        );

        if v_restore > 0 then
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
            v_prior_account.id,
            'adjustment',
            -v_restore,
            public.microusd_to_cents_mirror(-v_restore),
            'Purchased credits carried to the next billing period',
            jsonb_build_object(
              'type', 'managed_usage_prior_period_carry',
              'purchased_credit_event',
                'release_carry_out:' || p_idempotency_key || ':' || v_prior_account.id::text,
              'settlement_idempotency_key', p_idempotency_key,
              'idempotency_key',
                p_idempotency_key || ':carry_out:' || v_prior_account.id::text,
              'to_credit_account_id', v_account.id
            )
          );

          update public.token_credits account_row
          set credits_allocated_microusd = account_row.credits_allocated_microusd + v_restore,
              credits_allocated_cents = public.microusd_to_cents_mirror(
                account_row.credits_allocated_microusd + v_restore
              ),
              top_up_allocated_microusd = account_row.top_up_allocated_microusd + v_restore,
              top_up_allocated_cents = public.microusd_to_cents_mirror(
                account_row.top_up_allocated_microusd + v_restore
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
            'adjustment',
            v_restore,
            public.microusd_to_cents_mirror(v_restore),
            'Purchased credits carried from the previous billing period',
            jsonb_build_object(
              'type', 'managed_usage_prior_period_carry',
              'purchased_credit_event',
                'release_carry_in:' || p_idempotency_key || ':' || v_prior_account.id::text,
              'settlement_idempotency_key', p_idempotency_key,
              'idempotency_key',
                p_idempotency_key || ':carry_in:' || v_prior_account.id::text,
              'from_credit_account_id', v_prior_account.id
            )
          );

          v_restored := v_restored + v_restore;
        end if;
      end loop;

      -- Written last so draw_overage_from_prepaid_credits fires once, on the
      -- active account, over the request's whole net settlement.
      update public.token_credits account_row
      set credits_used_microusd = account_row.credits_used_microusd - v_active_release,
          credits_used_cents = public.microusd_to_cents_mirror(
            account_row.credits_used_microusd - v_active_release
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
        -v_active_release,
        public.microusd_to_cents_mirror(-v_active_release),
        p_description,
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('idempotency_key', p_idempotency_key)
      );

      v_remaining := v_remaining + v_restored + v_active_release;
      v_result := public.build_settlement_result(true, v_remaining, null, null,
        0, 0, 0, 0::numeric);
      insert into public.credit_idempotency_keys (idempotency_key, user_id, result)
      values (p_idempotency_key, p_user_id, v_result)
      on conflict (idempotency_key) do nothing;

      return query select
        true,
        v_remaining,
        null::text,
        null::text,
        0::bigint, 0::bigint, 0::bigint, 0::numeric;
      return;
    end if;
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

commit;
