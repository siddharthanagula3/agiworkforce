begin;

drop function if exists public.prepaid_credit_lots_microusd(text);

drop function if exists public.prepaid_credit_balances_microusd(text);

create or replace function public.prepaid_credit_balances_microusd(p_user_id text)
returns table (
  account_id uuid,
  bonus_microusd bigint,
  purchased_microusd bigint,
  overage_headroom_microusd bigint,
  next_bonus_expiry timestamptz
)
language sql
stable
as $$
  with account_row as (
    select credits.id,
           credits.credits_allocated_microusd - credits.credits_used_microusd as remaining,
           credits.top_up_allocated_microusd as purchased_allocated
    from public.token_credits credits
    where credits.user_id = p_user_id
      and credits.period_end > now()
    order by credits.period_end desc
    limit 1
  ),
  in_flight as (
    select public.overage_in_flight_microusd(p_user_id) as amount
  ),
  bonus_pool as (
    select coalesce(sum(grant_row.remaining_microusd), 0)::bigint as pooled,
           min(grant_row.expires_at) as next_expiry
    from public.bonus_credit_grants grant_row
    join account_row on account_row.id = grant_row.credit_account_id
    where grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
  ),
  overage_setting as (
    select coalesce(bool_or(subscription_row.overage_enabled), false) as enabled
    from public.subscriptions subscription_row
    where subscription_row.user_id = p_user_id
  ),
  settled as (
    select account_row.id,
           least(
             account_row.purchased_allocated,
             greatest(account_row.remaining + in_flight.amount, 0)
           ) as purchased,
           least(
             bonus_pool.pooled,
             greatest(account_row.remaining + in_flight.amount - account_row.purchased_allocated, 0)
           ) as bonus,
           in_flight.amount as in_flight,
           bonus_pool.next_expiry,
           overage_setting.enabled as overage_enabled
    from account_row, in_flight, bonus_pool, overage_setting
  ),
  available as (
    select settled.id,
           greatest(settled.bonus - settled.in_flight, 0)::bigint as bonus,
           greatest(
             settled.purchased
               - case
                   when settled.overage_enabled
                     then greatest(settled.in_flight - settled.bonus, 0)
                   else 0
                 end,
             0
           )::bigint as purchased,
           settled.overage_enabled,
           settled.next_expiry
    from settled
  )
  select available.id,
         available.bonus,
         available.purchased,
         (available.bonus
           + case when available.overage_enabled then available.purchased else 0 end)::bigint,
         available.next_expiry
  from available;
$$;

revoke all on function public.prepaid_credit_balances_microusd(text) from public;
grant execute on function public.prepaid_credit_balances_microusd(text) to app_rls;

drop trigger if exists draw_overage_from_prepaid_credits on public.credit_transactions;

create or replace function public.draw_overage_from_prepaid_credits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.token_credits%rowtype;
  v_to_draw bigint := coalesce(new.actual_cost_microusd, 0);
  v_grant record;
  v_take bigint;
  v_overage_enabled boolean;
begin
  if v_to_draw <= 0 then
    return null;
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.user_id = new.user_id
    and account_row.period_end > now()
  order by account_row.period_end desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  for v_grant in
    select grant_row.id, grant_row.remaining_microusd
    from public.bonus_credit_grants grant_row
    where grant_row.credit_account_id = v_account.id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
    order by grant_row.expires_at, grant_row.created_at, grant_row.id
    for update
  loop
    exit when v_to_draw = 0;
    v_take := least(v_grant.remaining_microusd, v_to_draw);
    update public.bonus_credit_grants
    set remaining_microusd = remaining_microusd - v_take
    where id = v_grant.id;
    v_to_draw := v_to_draw - v_take;
  end loop;

  if v_to_draw > 0 and v_account.top_up_allocated_microusd > 0 then
    select coalesce(bool_or(subscription_row.overage_enabled), false) into v_overage_enabled
    from public.subscriptions subscription_row
    where subscription_row.user_id = new.user_id;

    if v_overage_enabled then
      update public.token_credits
      set top_up_allocated_microusd =
            top_up_allocated_microusd - least(top_up_allocated_microusd, v_to_draw),
          top_up_allocated_cents = public.microusd_to_cents_mirror(
            top_up_allocated_microusd - least(top_up_allocated_microusd, v_to_draw)
          ),
          updated_at = now()
      where id = v_account.id;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.draw_overage_from_prepaid_credits() from public;

drop trigger if exists draw_overage_from_prepaid_credits on public.managed_usage_requests;
create trigger draw_overage_from_prepaid_credits
  after update of status on public.managed_usage_requests
  for each row
  when (new.is_overage and new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.draw_overage_from_prepaid_credits();

drop trigger if exists carry_prepaid_credits_into_new_account on public.token_credits;
drop function if exists public.carry_prepaid_credits_into_new_account();

create or replace function public.carry_bonus_credits_into_new_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.period_end > now()
    and not exists (
      select 1
      from public.token_credits other_row
      where other_row.user_id = new.user_id
        and other_row.id <> new.id
        and other_row.period_end > new.period_end
    )
    and exists (
      select 1
      from public.bonus_credit_grants grant_row
      where grant_row.user_id = new.user_id
        and grant_row.revoked_at is null
        and grant_row.remaining_microusd > 0
    )
  then
    perform public.reconcile_bonus_credit_grants(new.user_id, new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.carry_bonus_credits_into_new_account() from public;

drop trigger if exists carry_bonus_credits_into_new_account on public.token_credits;
create trigger carry_bonus_credits_into_new_account
  after insert on public.token_credits
  for each row execute function public.carry_bonus_credits_into_new_account();

drop function if exists public.reconcile_expiring_credit_purchases(text, uuid);

create or replace function public.reconcile_bonus_credit_grants(
  p_user_id text,
  p_target_account_id uuid default null
)
returns table (expired_microusd bigint, carried_microusd bigint, materialized_microusd bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_account_id uuid;
  v_current_holder_id uuid;
  v_in_flight bigint;
  v_account public.token_credits%rowtype;
  v_holder record;
  v_grant record;
  v_pooled bigint;
  v_unspent bigint;
  v_consumed bigint;
  v_expired bigint := 0;
  v_carried bigint := 0;
  v_materialized bigint := 0;
begin
  v_target_account_id := coalesce(
    p_target_account_id,
    (
      select account_row.id
      from public.token_credits account_row
      where account_row.user_id = p_user_id
        and account_row.period_end > now()
      order by account_row.period_end desc
      limit 1
    )
  );

  perform 1
  from public.token_credits account_row
  where account_row.user_id = p_user_id
    and (
      account_row.id = v_target_account_id
      or account_row.id in (
        select grant_row.credit_account_id
        from public.bonus_credit_grants grant_row
        where grant_row.user_id = p_user_id
          and grant_row.revoked_at is null
          and grant_row.remaining_microusd > 0
      )
    )
  order by account_row.id
  for update;

  select account_row.id into v_current_holder_id
  from public.token_credits account_row
  where account_row.id in (
    select grant_row.credit_account_id
    from public.bonus_credit_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
  )
  order by account_row.period_end desc
  limit 1;

  v_in_flight := public.overage_in_flight_microusd(p_user_id);

  for v_holder in
    select distinct grant_row.credit_account_id as account_id
    from public.bonus_credit_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.credit_account_id is not null
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
  loop
    select account_row.* into v_account
    from public.token_credits account_row
    where account_row.id = v_holder.account_id;

    select coalesce(sum(grant_row.remaining_microusd), 0)::bigint into v_pooled
    from public.bonus_credit_grants grant_row
    where grant_row.credit_account_id = v_holder.account_id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0;

    v_unspent := least(
      v_pooled,
      greatest(
        v_account.credits_allocated_microusd - v_account.credits_used_microusd
          + case when v_account.id = v_current_holder_id then v_in_flight else 0 end
          - v_account.top_up_allocated_microusd,
        0
      )
    );
    v_consumed := v_pooled - v_unspent;

    if v_consumed > 0 then
      with ordered as (
        select grant_row.id,
               grant_row.remaining_microusd,
               sum(grant_row.remaining_microusd) over (
                 order by grant_row.expires_at, grant_row.created_at, grant_row.id
               ) - grant_row.remaining_microusd as preceding
        from public.bonus_credit_grants grant_row
        where grant_row.credit_account_id = v_holder.account_id
          and grant_row.revoked_at is null
          and grant_row.remaining_microusd > 0
      )
      update public.bonus_credit_grants grant_row
      set remaining_microusd = grant_row.remaining_microusd
            - least(ordered.remaining_microusd, v_consumed - ordered.preceding)
      from ordered
      where grant_row.id = ordered.id
        and ordered.preceding < v_consumed;
    end if;
  end loop;

  for v_grant in
    select grant_row.id, grant_row.credit_account_id, grant_row.remaining_microusd,
           grant_row.source
    from public.bonus_credit_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
      and grant_row.expires_at <= now()
    order by grant_row.expires_at, grant_row.created_at, grant_row.id
    for update
  loop
    if v_grant.credit_account_id is not null then
      perform public.post_bonus_credit_adjustment(
        p_user_id,
        v_grant.credit_account_id,
        -v_grant.remaining_microusd,
        'adjustment',
        'expire:' || v_grant.id::text,
        'Bonus credits expired',
        jsonb_build_object('bonus_credit_grant_id', v_grant.id, 'source', v_grant.source)
      );
    end if;
    update public.bonus_credit_grants
    set remaining_microusd = 0
    where id = v_grant.id;
    v_expired := v_expired + v_grant.remaining_microusd;
  end loop;

  if v_target_account_id is not null then
    for v_grant in
      select grant_row.id, grant_row.credit_account_id, grant_row.remaining_microusd,
             grant_row.source
      from public.bonus_credit_grants grant_row
      where grant_row.user_id = p_user_id
        and grant_row.revoked_at is null
        and grant_row.remaining_microusd > 0
        and grant_row.credit_account_id is distinct from v_target_account_id
      order by grant_row.expires_at, grant_row.created_at, grant_row.id
      for update
    loop
      if v_grant.credit_account_id is null then
        perform public.add_credits_microusd(
          p_user_id,
          v_target_account_id,
          v_grant.remaining_microusd,
          case v_grant.source
            when 'referral_friend' then 'Referral bonus credits for joining'
            when 'referral_referrer' then 'Referral bonus credits for inviting a friend'
            else 'Promotional bonus credits'
          end,
          'bonus'
        );
        v_materialized := v_materialized + v_grant.remaining_microusd;
      else
        perform public.post_bonus_credit_adjustment(
          p_user_id,
          v_grant.credit_account_id,
          -v_grant.remaining_microusd,
          'reset',
          'carry_out:' || v_grant.id::text,
          'Bonus credits carried to the next billing period',
          jsonb_build_object('bonus_credit_grant_id', v_grant.id)
        );
        perform public.post_bonus_credit_adjustment(
          p_user_id,
          v_target_account_id,
          v_grant.remaining_microusd,
          'reset',
          'carry_in:' || v_grant.id::text,
          'Bonus credits carried from the previous billing period',
          jsonb_build_object('bonus_credit_grant_id', v_grant.id)
        );
        v_carried := v_carried + v_grant.remaining_microusd;
      end if;
      update public.bonus_credit_grants
      set credit_account_id = v_target_account_id
      where id = v_grant.id;
    end loop;
  end if;

  return query select v_expired, v_carried, v_materialized;
end;
$$;

revoke all on function public.reconcile_bonus_credit_grants(text, uuid) from public;

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
  v_unexpired_purchases_microusd bigint := 0;
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

    select coalesce(sum(purchase_row.amount_microusd), 0)::bigint
      into v_unexpired_purchases_microusd
    from public.credit_transactions purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.transaction_type = 'purchase'
      and purchase_row.amount_microusd > 0
      and purchase_row.created_at > p_period_start - interval '12 months';

    v_carried_top_up_microusd := least(
      v_previous.top_up_allocated_microusd,
      v_remaining_microusd,
      v_unexpired_purchases_microusd
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



drop function if exists public.post_purchased_credit_adjustment(
  text, uuid, bigint, text, text, text, jsonb
);

drop trigger if exists record_expiring_credit_purchase on public.credit_transactions;
drop function if exists public.record_expiring_credit_purchase();

drop function if exists public.add_credits_microusd(text, uuid, bigint, text, text, jsonb);

create or replace function public.add_credits_microusd(
  p_user_id text,
  p_account_id uuid,
  p_amount_microusd bigint,
  p_description text,
  p_transaction_type text default 'purchase'
)
returns void
language plpgsql
as $$
begin
  if p_amount_microusd <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  if p_transaction_type not in ('purchase', 'adjustment', 'refund', 'bonus') then
    raise exception 'invalid transaction type: %', p_transaction_type;
  end if;

  update public.token_credits
  set credits_allocated_microusd = credits_allocated_microusd + p_amount_microusd,
      credits_allocated_cents =
        public.microusd_to_cents_mirror(credits_allocated_microusd + p_amount_microusd),
      top_up_allocated_microusd = top_up_allocated_microusd
        + case when p_transaction_type = 'purchase' then p_amount_microusd else 0 end,
      top_up_allocated_cents = public.microusd_to_cents_mirror(
        top_up_allocated_microusd
          + case when p_transaction_type = 'purchase' then p_amount_microusd else 0 end
      ),
      credits_used_microusd = greatest(0::bigint, credits_used_microusd),
      credits_used_cents = public.microusd_to_cents_mirror(
        greatest(0::bigint, credits_used_microusd)
      ),
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'credit account not found for user';
  end if;

  insert into public.credit_transactions (
    user_id, credit_account_id, amount_microusd, amount_cents, transaction_type, description
  ) values (
    p_user_id,
    p_account_id,
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_transaction_type,
    p_description
  );
end;
$$;

revoke all on function public.add_credits_microusd(text, uuid, bigint, text, text) from public;
grant execute on function public.add_credits_microusd(text, uuid, bigint, text, text) to app_rls;

drop function if exists public.managed_usage_in_flight_microusd(text);

drop index if exists public.idx_credit_transactions_purchased_credit_event;
drop index if exists public.idx_credit_transactions_overage_request;
drop index if exists public.idx_managed_usage_requests_in_flight;

drop policy if exists expiring_credit_purchases_owner_read on public.expiring_credit_purchases;
alter table public.expiring_credit_purchases no force row level security;
alter table public.expiring_credit_purchases disable row level security;

drop trigger if exists expiring_credit_purchases_assign_version on public.expiring_credit_purchases;
drop trigger if exists set_expiring_credit_purchases_updated_at on public.expiring_credit_purchases;

drop index if exists public.idx_expiring_credit_purchases_unreminded;
drop index if exists public.idx_expiring_credit_purchases_live_expiry;
drop index if exists public.idx_expiring_credit_purchases_live_account;
drop index if exists public.idx_expiring_credit_purchases_user_expiry;

drop table if exists public.expiring_credit_purchases;

delete from public.schema_migrations where filename = '0298_purchased_credit_lifetime.sql';

commit;
