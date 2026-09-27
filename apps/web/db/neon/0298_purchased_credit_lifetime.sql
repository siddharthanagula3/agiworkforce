-- destructive: carry_bonus_credits_into_new_account is replaced by carry_prepaid_credits_into_new_account, which also carries purchased credits and expiring purchases; no data is held by either.
begin;

create table if not exists public.expiring_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  credit_transaction_id uuid references public.credit_transactions(id) on delete set null,
  credit_account_id uuid references public.token_credits(id) on delete set null,
  purchase_country text not null check (purchase_country ~ '^[A-Z]{2}$'),
  reference text not null check (char_length(reference) between 1 and 300),
  purchased_microusd bigint not null check (purchased_microusd > 0),
  remaining_microusd bigint not null,
  expires_at timestamptz not null,
  reminded_at timestamptz,
  expired_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint expiring_credit_purchases_remaining_valid
    check (remaining_microusd >= 0 and remaining_microusd <= purchased_microusd),
  constraint expiring_credit_purchases_expires_after_purchase check (expires_at > created_at),
  constraint expiring_credit_purchases_reference_unique unique (user_id, reference)
);

create index if not exists idx_expiring_credit_purchases_user_expiry
  on public.expiring_credit_purchases (user_id, expires_at);

create index if not exists idx_expiring_credit_purchases_live_account
  on public.expiring_credit_purchases (credit_account_id, expires_at)
  where expired_at is null and remaining_microusd > 0;

create index if not exists idx_expiring_credit_purchases_live_expiry
  on public.expiring_credit_purchases (expires_at)
  where expired_at is null and remaining_microusd > 0;

create index if not exists idx_expiring_credit_purchases_unreminded
  on public.expiring_credit_purchases (expires_at)
  where reminded_at is null and expired_at is null and remaining_microusd > 0;

drop trigger if exists set_expiring_credit_purchases_updated_at on public.expiring_credit_purchases;
create trigger set_expiring_credit_purchases_updated_at
  before update on public.expiring_credit_purchases
  for each row execute function public.set_row_updated_at();

drop trigger if exists expiring_credit_purchases_assign_version on public.expiring_credit_purchases;
create trigger expiring_credit_purchases_assign_version
  before insert or update on public.expiring_credit_purchases
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.expiring_credit_purchases from app_rls;
grant select on public.expiring_credit_purchases to app_rls;

alter table public.expiring_credit_purchases enable row level security;
alter table public.expiring_credit_purchases force row level security;

drop policy if exists expiring_credit_purchases_owner_read on public.expiring_credit_purchases;
create policy expiring_credit_purchases_owner_read
  on public.expiring_credit_purchases
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

comment on table public.expiring_credit_purchases is
  'One row per credit purchase that local law makes expire, today purchases made in Japan, six months after purchase under the Payment Services Act. Purchased credit bought anywhere else never expires and has no row here. remaining_microusd is spent before non-expiring purchased credit, soonest expiry first.';

create index if not exists idx_managed_usage_requests_in_flight
  on public.managed_usage_requests (user_id)
  where status = any (array['reserving', 'reserved', 'provider_started']);

create index if not exists idx_credit_transactions_overage_request
  on public.credit_transactions (user_id, (metadata->>'managed_usage_request_id'))
  where metadata->>'is_overage' = 'true';

create unique index if not exists idx_credit_transactions_purchased_credit_event
  on public.credit_transactions (credit_account_id, (metadata->>'purchased_credit_event'))
  where metadata ? 'purchased_credit_event';

create or replace function public.managed_usage_in_flight_microusd(p_user_id text)
returns bigint
language sql
stable
as $$
  select coalesce(sum(request_row.estimated_cost_microusd), 0)::bigint
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.status = any (array['reserving', 'reserved', 'provider_started']);
$$;

revoke all on function public.managed_usage_in_flight_microusd(text) from public;

drop function if exists public.add_credits_microusd(text, uuid, bigint, text, text);

create or replace function public.add_credits_microusd(
  p_user_id text,
  p_account_id uuid,
  p_amount_microusd bigint,
  p_description text,
  p_transaction_type text default 'purchase',
  p_metadata jsonb default '{}'::jsonb
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
    user_id, credit_account_id, amount_microusd, amount_cents, transaction_type, description,
    metadata
  ) values (
    p_user_id,
    p_account_id,
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_transaction_type,
    p_description,
    nullif(coalesce(p_metadata, '{}'::jsonb), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.add_credits_microusd(text, uuid, bigint, text, text, jsonb)
  from public;
grant execute on function public.add_credits_microusd(text, uuid, bigint, text, text, jsonb)
  to app_rls;

create or replace function public.record_expiring_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.expiring_credit_purchases (
    user_id, credit_transaction_id, credit_account_id, purchase_country, reference,
    purchased_microusd, remaining_microusd, expires_at
  ) values (
    new.user_id,
    new.id,
    new.credit_account_id,
    new.metadata->>'purchase_country',
    coalesce(new.description, new.id::text),
    new.amount_microusd,
    new.amount_microusd,
    (new.metadata->>'purchase_expires_at')::timestamptz
  )
  on conflict (user_id, reference) do nothing;
  return null;
end;
$$;

revoke all on function public.record_expiring_credit_purchase() from public;

drop trigger if exists record_expiring_credit_purchase on public.credit_transactions;
create trigger record_expiring_credit_purchase
  after insert on public.credit_transactions
  for each row
  when (
    new.transaction_type = 'purchase'
    and new.amount_microusd > 0
    and new.metadata ? 'purchase_country'
    and new.metadata ? 'purchase_expires_at'
  )
  execute function public.record_expiring_credit_purchase();

create or replace function public.post_purchased_credit_adjustment(
  p_user_id text,
  p_account_id uuid,
  p_amount_microusd bigint,
  p_transaction_type text,
  p_event text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  if p_amount_microusd is null or p_amount_microusd = 0 then
    return;
  end if;
  if p_transaction_type not in ('adjustment', 'reset') then
    raise exception 'invalid purchased credit transaction type: %', p_transaction_type;
  end if;
  if p_event is null or length(p_event) = 0 then
    raise exception 'purchased credit adjustment needs an event key';
  end if;

  update public.token_credits
  set credits_allocated_microusd = credits_allocated_microusd + p_amount_microusd,
      credits_allocated_cents =
        public.microusd_to_cents_mirror(credits_allocated_microusd + p_amount_microusd),
      top_up_allocated_microusd = top_up_allocated_microusd + p_amount_microusd,
      top_up_allocated_cents =
        public.microusd_to_cents_mirror(top_up_allocated_microusd + p_amount_microusd),
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;

  if not found then
    raise exception 'credit account not found for user';
  end if;

  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_microusd, amount_cents,
    description, metadata
  ) values (
    p_user_id,
    p_account_id,
    p_transaction_type,
    p_amount_microusd,
    public.microusd_to_cents_mirror(p_amount_microusd),
    p_description,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('purchased_credit_event', p_event)
  );
end;
$$;

revoke all on function public.post_purchased_credit_adjustment(
  text, uuid, bigint, text, text, text, jsonb
) from public;

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

  v_in_flight := public.managed_usage_in_flight_microusd(p_user_id);

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
create or replace function public.reconcile_expiring_credit_purchases(
  p_user_id text,
  p_target_account_id uuid default null
)
returns table (expired_microusd bigint, moved_purchases integer)
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
  v_purchase record;
  v_pooled bigint;
  v_purchased_unspent bigint;
  v_unspent bigint;
  v_consumed bigint;
  v_expired bigint := 0;
  v_moved integer := 0;
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
        select purchase_row.credit_account_id
        from public.expiring_credit_purchases purchase_row
        where purchase_row.user_id = p_user_id
          and purchase_row.expired_at is null
          and purchase_row.remaining_microusd > 0
      )
    )
  order by account_row.id
  for update;

  select account_row.id into v_current_holder_id
  from public.token_credits account_row
  where account_row.id in (
    select purchase_row.credit_account_id
    from public.expiring_credit_purchases purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
  )
  order by account_row.period_end desc
  limit 1;

  v_in_flight := public.managed_usage_in_flight_microusd(p_user_id);

  for v_holder in
    select distinct purchase_row.credit_account_id as account_id
    from public.expiring_credit_purchases purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.credit_account_id is not null
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
  loop
    select account_row.* into v_account
    from public.token_credits account_row
    where account_row.id = v_holder.account_id;

    select coalesce(sum(purchase_row.remaining_microusd), 0)::bigint into v_pooled
    from public.expiring_credit_purchases purchase_row
    where purchase_row.credit_account_id = v_holder.account_id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0;

    v_purchased_unspent := least(
      v_account.top_up_allocated_microusd,
      greatest(
        v_account.credits_allocated_microusd - v_account.credits_used_microusd
          + case when v_account.id = v_current_holder_id then v_in_flight else 0 end,
        0
      )
    );
    v_unspent := least(
      v_pooled,
      greatest(
        v_purchased_unspent - greatest(v_account.top_up_allocated_microusd - v_pooled, 0),
        0
      )
    );
    v_consumed := v_pooled - v_unspent;

    if v_consumed > 0 then
      with ordered as (
        select purchase_row.id,
               purchase_row.remaining_microusd,
               sum(purchase_row.remaining_microusd) over (
                 order by purchase_row.expires_at, purchase_row.created_at, purchase_row.id
               ) - purchase_row.remaining_microusd as preceding
        from public.expiring_credit_purchases purchase_row
        where purchase_row.credit_account_id = v_holder.account_id
          and purchase_row.expired_at is null
          and purchase_row.remaining_microusd > 0
      )
      update public.expiring_credit_purchases purchase_row
      set remaining_microusd = purchase_row.remaining_microusd
            - least(ordered.remaining_microusd, v_consumed - ordered.preceding)
      from ordered
      where purchase_row.id = ordered.id
        and ordered.preceding < v_consumed;

      update public.token_credits
      set top_up_allocated_microusd = top_up_allocated_microusd
            - (v_consumed - greatest(v_pooled - v_account.top_up_allocated_microusd, 0)),
          top_up_allocated_cents = public.microusd_to_cents_mirror(
            top_up_allocated_microusd
              - (v_consumed - greatest(v_pooled - v_account.top_up_allocated_microusd, 0))
          ),
          updated_at = now()
      where id = v_holder.account_id;
    end if;
  end loop;

  for v_purchase in
    select purchase_row.id, purchase_row.credit_account_id, purchase_row.remaining_microusd,
           purchase_row.purchase_country
    from public.expiring_credit_purchases purchase_row
    where purchase_row.user_id = p_user_id
      and purchase_row.expired_at is null
      and purchase_row.expires_at <= now()
    order by purchase_row.expires_at, purchase_row.created_at, purchase_row.id
    for update
  loop
    if v_purchase.credit_account_id is not null and v_purchase.remaining_microusd > 0 then
      perform public.post_purchased_credit_adjustment(
        p_user_id,
        v_purchase.credit_account_id,
        -v_purchase.remaining_microusd,
        'adjustment',
        'expire:' || v_purchase.id::text,
        'Purchased credits expired',
        jsonb_build_object(
          'expiring_credit_purchase_id', v_purchase.id,
          'purchase_country', v_purchase.purchase_country
        )
      );
      v_expired := v_expired + v_purchase.remaining_microusd;
    end if;
    update public.expiring_credit_purchases
    set remaining_microusd = 0,
        expired_at = now()
    where id = v_purchase.id;
  end loop;

  if v_target_account_id is not null then
    update public.expiring_credit_purchases purchase_row
    set credit_account_id = v_target_account_id
    where purchase_row.user_id = p_user_id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
      and purchase_row.credit_account_id is distinct from v_target_account_id;
    get diagnostics v_moved = row_count;
  end if;

  return query select v_expired, v_moved;
end;
$$;

revoke all on function public.reconcile_expiring_credit_purchases(text, uuid) from public;

drop trigger if exists carry_bonus_credits_into_new_account on public.token_credits;
drop function if exists public.carry_bonus_credits_into_new_account();

create or replace function public.carry_prepaid_credits_into_new_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.token_credits%rowtype;
  v_purchased bigint;
begin
  if new.period_end <= now()
    or exists (
      select 1
      from public.token_credits other_row
      where other_row.user_id = new.user_id
        and other_row.id <> new.id
        and other_row.period_end > new.period_end
    )
  then
    return null;
  end if;

  select previous_row.* into v_previous
  from public.token_credits previous_row
  where previous_row.user_id = new.user_id
    and previous_row.id <> new.id
  order by previous_row.period_end desc
  limit 1
  for update;

  if exists (
    select 1
    from public.expiring_credit_purchases purchase_row
    where purchase_row.user_id = new.user_id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
  ) then
    perform public.reconcile_expiring_credit_purchases(new.user_id, new.id);
  end if;

  if exists (
    select 1
    from public.bonus_credit_grants grant_row
    where grant_row.user_id = new.user_id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
  ) then
    perform public.reconcile_bonus_credit_grants(new.user_id, new.id);
  end if;

  if v_previous.id is not null and new.top_up_allocated_microusd = 0 then
    select previous_row.* into v_previous
    from public.token_credits previous_row
    where previous_row.id = v_previous.id;

    v_purchased := least(
      v_previous.top_up_allocated_microusd,
      greatest(v_previous.credits_allocated_microusd - v_previous.credits_used_microusd, 0)
    );

    if v_purchased > 0 then
      perform public.post_purchased_credit_adjustment(
        new.user_id,
        v_previous.id,
        -v_purchased,
        'reset',
        'carry_out:' || new.id::text,
        'Purchased credits carried to the new plan',
        jsonb_build_object('to_credit_account_id', new.id)
      );
      perform public.post_purchased_credit_adjustment(
        new.user_id,
        new.id,
        v_purchased,
        'reset',
        'carry_in:' || v_previous.id::text,
        'Purchased credits carried from the previous plan',
        jsonb_build_object('from_credit_account_id', v_previous.id)
      );
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.carry_prepaid_credits_into_new_account() from public;

drop trigger if exists carry_prepaid_credits_into_new_account on public.token_credits;
create trigger carry_prepaid_credits_into_new_account
  after insert on public.token_credits
  for each row execute function public.carry_prepaid_credits_into_new_account();

drop trigger if exists draw_overage_from_prepaid_credits on public.managed_usage_requests;

create or replace function public.draw_overage_from_prepaid_credits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.token_credits%rowtype;
  v_to_draw bigint;
  v_purchased_draw bigint;
  v_take bigint;
  v_lot record;
  v_overage_enabled boolean;
begin
  select coalesce(sum(transaction_row.amount_microusd), 0)::bigint into v_to_draw
  from public.credit_transactions transaction_row
  where transaction_row.user_id = new.user_id
    and transaction_row.transaction_type = 'deduction'
    and transaction_row.metadata->>'is_overage' = 'true'
    and transaction_row.metadata->>'managed_usage_request_id'
      = new.metadata->>'managed_usage_request_id';

  if v_to_draw <= 0 then
    return null;
  end if;

  select account_row.* into v_account
  from public.token_credits account_row
  where account_row.id = new.credit_account_id
  for update;

  if not found then
    return null;
  end if;

  for v_lot in
    select grant_row.id, grant_row.remaining_microusd
    from public.bonus_credit_grants grant_row
    where grant_row.credit_account_id = v_account.id
      and grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
    order by grant_row.expires_at, grant_row.created_at, grant_row.id
    for update
  loop
    exit when v_to_draw = 0;
    v_take := least(v_lot.remaining_microusd, v_to_draw);
    update public.bonus_credit_grants
    set remaining_microusd = remaining_microusd - v_take
    where id = v_lot.id;
    v_to_draw := v_to_draw - v_take;
  end loop;

  if v_to_draw = 0 then
    return null;
  end if;

  select coalesce(bool_or(subscription_row.overage_enabled), false) into v_overage_enabled
  from public.subscriptions subscription_row
  where subscription_row.user_id = new.user_id;

  v_purchased_draw := least(v_to_draw, v_account.top_up_allocated_microusd);
  if not v_overage_enabled or v_purchased_draw <= 0 then
    return null;
  end if;

  v_to_draw := v_purchased_draw;
  for v_lot in
    select purchase_row.id, purchase_row.remaining_microusd
    from public.expiring_credit_purchases purchase_row
    where purchase_row.credit_account_id = v_account.id
      and purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
    order by purchase_row.expires_at, purchase_row.created_at, purchase_row.id
    for update
  loop
    exit when v_to_draw = 0;
    v_take := least(v_lot.remaining_microusd, v_to_draw);
    update public.expiring_credit_purchases
    set remaining_microusd = remaining_microusd - v_take
    where id = v_lot.id;
    v_to_draw := v_to_draw - v_take;
  end loop;

  update public.token_credits
  set top_up_allocated_microusd = top_up_allocated_microusd - v_purchased_draw,
      top_up_allocated_cents =
        public.microusd_to_cents_mirror(top_up_allocated_microusd - v_purchased_draw),
      updated_at = now()
  where id = v_account.id;

  return null;
end;
$$;

revoke all on function public.draw_overage_from_prepaid_credits() from public;

drop trigger if exists draw_overage_from_prepaid_credits on public.credit_transactions;
create trigger draw_overage_from_prepaid_credits
  after insert on public.credit_transactions
  for each row
  when (
    new.transaction_type = 'deduction'
    and new.metadata->>'is_overage' = 'true'
    and new.metadata->>'type' = 'managed_usage_finalization'
  )
  execute function public.draw_overage_from_prepaid_credits();

drop function if exists public.prepaid_credit_balances_microusd(text);

create or replace function public.prepaid_credit_balances_microusd(p_user_id text)
returns table (
  account_id uuid,
  bonus_microusd bigint,
  purchased_microusd bigint,
  expiring_purchased_microusd bigint,
  overage_headroom_microusd bigint,
  next_bonus_expiry timestamptz,
  next_purchase_expiry timestamptz
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
  purchase_pool as (
    select coalesce(sum(purchase_row.remaining_microusd), 0)::bigint as pooled,
           min(purchase_row.expires_at) as next_expiry
    from public.expiring_credit_purchases purchase_row
    join account_row on account_row.id = purchase_row.credit_account_id
    where purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
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
           account_row.purchased_allocated,
           purchase_pool.pooled as expiring_pooled,
           in_flight.amount as in_flight,
           bonus_pool.next_expiry,
           purchase_pool.next_expiry as next_purchase_expiry,
           overage_setting.enabled as overage_enabled
    from account_row, in_flight, bonus_pool, purchase_pool, overage_setting
  ),
  drawn as (
    select settled.*,
           least(
             settled.expiring_pooled,
             greatest(
               settled.purchased
                 - greatest(settled.purchased_allocated - settled.expiring_pooled, 0),
               0
             )
           ) as expiring,
           case
             when settled.overage_enabled then greatest(settled.in_flight - settled.bonus, 0)
             else 0
           end as purchased_draw
    from settled
  )
  select drawn.id,
         greatest(drawn.bonus - drawn.in_flight, 0)::bigint,
         greatest(drawn.purchased - drawn.purchased_draw, 0)::bigint,
         greatest(drawn.expiring - drawn.purchased_draw, 0)::bigint,
         (greatest(drawn.bonus - drawn.in_flight, 0)
           + case
               when drawn.overage_enabled then greatest(drawn.purchased - drawn.purchased_draw, 0)
               else 0
             end)::bigint,
         drawn.next_expiry,
         drawn.next_purchase_expiry
  from drawn;
$$;

revoke all on function public.prepaid_credit_balances_microusd(text) from public;
grant execute on function public.prepaid_credit_balances_microusd(text) to app_rls;

create or replace function public.prepaid_credit_lots_microusd(p_user_id text)
returns table (
  lot_kind text,
  lot_id uuid,
  source text,
  remaining_microusd bigint,
  expires_at timestamptz
)
language sql
stable
as $$
  with balances as (
    select * from public.prepaid_credit_balances_microusd(p_user_id)
  ),
  bonus_lots as (
    select grant_row.id, grant_row.source, grant_row.remaining_microusd, grant_row.expires_at,
           sum(grant_row.remaining_microusd) over (
             order by grant_row.expires_at, grant_row.created_at, grant_row.id
           ) - grant_row.remaining_microusd as preceding
    from public.bonus_credit_grants grant_row
    join balances on balances.account_id = grant_row.credit_account_id
    where grant_row.revoked_at is null
      and grant_row.remaining_microusd > 0
  ),
  bonus_consumed as (
    select greatest(
             coalesce(sum(bonus_lots.remaining_microusd), 0)
               - coalesce((select balances.bonus_microusd from balances), 0),
             0
           ) as consumed
    from bonus_lots
  ),
  purchase_lots as (
    select purchase_row.id, purchase_row.purchase_country, purchase_row.remaining_microusd,
           purchase_row.expires_at,
           sum(purchase_row.remaining_microusd) over (
             order by purchase_row.expires_at, purchase_row.created_at, purchase_row.id
           ) - purchase_row.remaining_microusd as preceding
    from public.expiring_credit_purchases purchase_row
    join balances on balances.account_id = purchase_row.credit_account_id
    where purchase_row.expired_at is null
      and purchase_row.remaining_microusd > 0
  ),
  purchase_consumed as (
    select greatest(
             coalesce(sum(purchase_lots.remaining_microusd), 0)
               - coalesce((select balances.expiring_purchased_microusd from balances), 0),
             0
           ) as consumed
    from purchase_lots
  )
  select 'bonus'::text,
         bonus_lots.id,
         bonus_lots.source,
         (bonus_lots.remaining_microusd
           - least(
               bonus_lots.remaining_microusd,
               greatest(bonus_consumed.consumed - bonus_lots.preceding, 0)
             ))::bigint,
         bonus_lots.expires_at
  from bonus_lots, bonus_consumed
  union all
  select 'bonus'::text, grant_row.id, grant_row.source, grant_row.remaining_microusd,
         grant_row.expires_at
  from public.bonus_credit_grants grant_row
  where grant_row.user_id = p_user_id
    and grant_row.credit_account_id is null
    and grant_row.revoked_at is null
    and grant_row.remaining_microusd > 0
    and grant_row.expires_at > now()
  union all
  select 'purchase'::text,
         purchase_lots.id,
         purchase_lots.purchase_country,
         (purchase_lots.remaining_microusd
           - least(
               purchase_lots.remaining_microusd,
               greatest(purchase_consumed.consumed - purchase_lots.preceding, 0)
             ))::bigint,
         purchase_lots.expires_at
  from purchase_lots, purchase_consumed;
$$;

revoke all on function public.prepaid_credit_lots_microusd(text) from public;
grant execute on function public.prepaid_credit_lots_microusd(text) to app_rls;

commit;
