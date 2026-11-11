-- =============================================================================
-- Migration 0414: renewal expires due purchased credit before it carries any
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : reset_credits_for_period_microusd (0298) computed the purchased
--          carry from the previous account before anything expired that
--          account's due purchase lots. The AFTER INSERT trigger
--          carry_prepaid_credits_into_new_account then expired the lot against
--          the previous account, but skipped its own carry because the new
--          account already held a positive top-up. A lot that fell due before
--          the expiry sweep reached it was therefore copied into the new period
--          as purchased credit with no live lot behind it, so nothing would
--          ever expire it (PREPAID-ROLLOVER-01).
--
-- Shape  : reset_credits_for_period_microusd keeps its 0298 body, signature and
--          grants. One block after the previous account is locked: when the
--          user has a live purchase lot already past its expiry,
--          reconcile_expiring_credit_purchases(user, previous account) expires
--          it against the previous account first and the previous row is read
--          again, so least(top-up, allocated - used) is taken net of expired
--          credit. The reset ledger row also records which account the carry
--          came from (from_credit_account_id), which 0415 reads when a
--          reservation is released after renewal.
--
-- Empty  : no rows are rewritten. An account that already carried an expired
--          lot keeps that balance; correcting it is a separate decision.
--
-- Depends: 0298 (reset_credits_for_period_microusd,
--          reconcile_expiring_credit_purchases, expiring_credit_purchases)
-- =============================================================================

begin;

create or replace function public.reset_credits_for_period_microusd(
  p_user_id text,
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credits_allocated_microusd bigint
)
returns uuid
language plpgsql
as $$
declare
  v_account_id uuid;
  v_previous public.token_credits%rowtype;
  v_remaining_microusd bigint := 0;
  v_carried_top_up_microusd bigint := 0;
  v_allocated_microusd bigint;
begin
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

  select account_row.* into v_previous
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and account_row.subscription_id = p_subscription_id
    and account_row.period_start < p_period_start
  order by account_row.period_end desc
  limit 1
  for update;

  if v_previous.id is not null and exists (
    select 1
    from public.expiring_credit_purchases purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
      and purchase_row.expires_at <= now()
  ) then
    perform public.reconcile_expiring_credit_purchases(p_user_id, v_previous.id);

    select account_row.* into v_previous
    from public.token_credits account_row
    where account_row.id = v_previous.id;
  end if;

  if v_previous.id is not null then
    v_remaining_microusd := greatest(
      v_previous.credits_allocated_microusd - v_previous.credits_used_microusd,
      0
    );

    v_carried_top_up_microusd := least(
      v_previous.top_up_allocated_microusd,
      v_remaining_microusd
    );
  end if;

  v_allocated_microusd := p_credits_allocated_microusd + v_carried_top_up_microusd;

  insert into public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_microusd,
    credits_allocated_cents,
    top_up_allocated_microusd,
    top_up_allocated_cents,
    credits_used_microusd,
    credits_used_cents,
    flagship_used_today_microusd,
    flagship_used_today_cents,
    flagship_cap_reset_date
  ) values (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    v_allocated_microusd,
    public.microusd_to_cents_mirror(v_allocated_microusd),
    v_carried_top_up_microusd,
    public.microusd_to_cents_mirror(v_carried_top_up_microusd),
    0,
    0,
    0,
    0,
    current_date
  )
  returning id into v_account_id;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type,
    amount_microusd, amount_cents, description, metadata
  ) values (
    p_user_id,
    v_account_id,
    'reset',
    v_allocated_microusd,
    public.microusd_to_cents_mirror(v_allocated_microusd),
    'credit reset for new billing period',
    jsonb_build_object(
      'carried_top_up_microusd', v_carried_top_up_microusd,
      'carried_top_up_cents', public.microusd_to_cents_mirror(v_carried_top_up_microusd),
      'from_credit_account_id', v_previous.id
    )
  );

  return v_account_id;
end;
$$;

revoke all on function public.reset_credits_for_period_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) from public;
grant execute on function public.reset_credits_for_period_microusd(
  text, uuid, timestamptz, timestamptz, bigint
) to app_rls;

commit;
