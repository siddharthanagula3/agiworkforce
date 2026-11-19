-- Reversal of 0414: reset_credits_for_period_microusd goes back to its 0298
-- body.
--
-- WHAT THIS COSTS: a renewal that runs after a purchase lot fell due but
-- before the expiry sweep reached it copies that lot's balance into the new
-- period again, as purchased credit no lot will ever expire. Reset ledger rows
-- stop recording the account the carry came from, so 0415 (if still applied)
-- can no longer cap a post-renewal restore by what that renewal carried and
-- falls back to the previous account's own balance. Accounts created while
-- 0414 was applied keep their balances.

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
      'carried_top_up_cents', public.microusd_to_cents_mirror(v_carried_top_up_microusd)
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

delete from public.schema_migrations
 where filename = '0414_renewal_expires_due_purchases_before_carry.sql';

commit;
