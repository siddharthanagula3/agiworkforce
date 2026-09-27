begin;

create table if not exists public.bonus_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  source text not null
    check (source = any (array['referral_referrer', 'referral_friend', 'promo'])),
  microusd_per_credit integer not null check (microusd_per_credit > 0),
  granted_microusd bigint not null check (granted_microusd > 0),
  remaining_microusd bigint not null,
  credits_granted numeric(14, 4)
    generated always as (round(granted_microusd::numeric / microusd_per_credit, 4)) stored,
  credits_remaining numeric(14, 4)
    generated always as (round(remaining_microusd::numeric / microusd_per_credit, 4)) stored,
  credit_account_id uuid references public.token_credits(id) on delete set null,
  expires_at timestamptz not null,
  reference_id text not null check (char_length(reference_id) between 1 and 200),
  created_by text check (created_by is null or char_length(created_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  revoked_at timestamptz,
  constraint bonus_credit_grants_remaining_valid
    check (remaining_microusd >= 0 and remaining_microusd <= granted_microusd),
  constraint bonus_credit_grants_expires_after_grant check (expires_at > created_at),
  constraint bonus_credit_grants_reference_unique unique (user_id, source, reference_id)
);

create index if not exists idx_bonus_credit_grants_user_expiry
  on public.bonus_credit_grants (user_id, expires_at);

create index if not exists idx_bonus_credit_grants_live_account
  on public.bonus_credit_grants (credit_account_id, expires_at)
  where revoked_at is null and remaining_microusd > 0;

create index if not exists idx_bonus_credit_grants_live_expiry
  on public.bonus_credit_grants (expires_at)
  where revoked_at is null and remaining_microusd > 0;

drop trigger if exists set_bonus_credit_grants_updated_at on public.bonus_credit_grants;
create trigger set_bonus_credit_grants_updated_at
  before update on public.bonus_credit_grants
  for each row execute function public.set_row_updated_at();

drop trigger if exists bonus_credit_grants_assign_version on public.bonus_credit_grants;
create trigger bonus_credit_grants_assign_version
  before insert or update on public.bonus_credit_grants
  for each row execute function public.assign_cloud_sync_version();

revoke all on public.bonus_credit_grants from app_rls;
grant select on public.bonus_credit_grants to app_rls;

alter table public.bonus_credit_grants enable row level security;
alter table public.bonus_credit_grants force row level security;

drop policy if exists bonus_credit_grants_owner_read on public.bonus_credit_grants;
create policy bonus_credit_grants_owner_read
  on public.bonus_credit_grants
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

comment on table public.bonus_credit_grants is
  'One row per bonus credit grant. The grant is added to the credit account allocation it names; remaining_microusd is what is left of it, consumed after the plan windows and before purchased credit, soonest expiry first. Written only on the service connection.';

create unique index if not exists idx_credit_transactions_bonus_credit_event
  on public.credit_transactions (credit_account_id, (metadata->>'bonus_credit_event'))
  where metadata ? 'bonus_credit_event';

create index if not exists idx_managed_usage_requests_overage_in_flight
  on public.managed_usage_requests (user_id)
  where is_overage and status = any (array['reserving', 'reserved', 'provider_started']);

create or replace function public.overage_in_flight_microusd(p_user_id text)
returns bigint
language sql
stable
as $$
  select coalesce(sum(request_row.estimated_cost_microusd), 0)::bigint
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.is_overage
    and request_row.status = any (array['reserving', 'reserved', 'provider_started']);
$$;

revoke all on function public.overage_in_flight_microusd(text) from public;
grant execute on function public.overage_in_flight_microusd(text) to app_rls;

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

create or replace function public.post_bonus_credit_adjustment(
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
    raise exception 'invalid bonus credit transaction type: %', p_transaction_type;
  end if;
  if p_event is null or length(p_event) = 0 then
    raise exception 'bonus credit adjustment needs an event key';
  end if;

  update public.token_credits
  set credits_allocated_microusd = credits_allocated_microusd + p_amount_microusd,
      credits_allocated_cents =
        public.microusd_to_cents_mirror(credits_allocated_microusd + p_amount_microusd),
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
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('bonus_credit_event', p_event)
  );
end;
$$;

revoke all on function public.post_bonus_credit_adjustment(
  text, uuid, bigint, text, text, text, jsonb
) from public;

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

create or replace function public.grant_bonus_credits(
  p_user_id text,
  p_source text,
  p_amount_microusd bigint,
  p_microusd_per_credit integer,
  p_expires_at timestamptz,
  p_reference_id text,
  p_organization_id uuid default null,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant_id uuid;
begin
  if p_amount_microusd is null or p_amount_microusd <= 0 then
    raise exception 'bonus credit amount must be positive';
  end if;

  insert into public.bonus_credit_grants (
    user_id, organization_id, source, microusd_per_credit, granted_microusd,
    remaining_microusd, expires_at, reference_id, created_by
  ) values (
    p_user_id, p_organization_id, p_source, p_microusd_per_credit, p_amount_microusd,
    p_amount_microusd, p_expires_at, p_reference_id, p_created_by
  )
  on conflict (user_id, source, reference_id) do nothing
  returning id into v_grant_id;

  if v_grant_id is null then
    select grant_row.id into v_grant_id
    from public.bonus_credit_grants grant_row
    where grant_row.user_id = p_user_id
      and grant_row.source = p_source
      and grant_row.reference_id = p_reference_id;
    return v_grant_id;
  end if;

  perform public.reconcile_bonus_credit_grants(p_user_id);
  return v_grant_id;
end;
$$;

revoke all on function public.grant_bonus_credits(
  text, text, bigint, integer, timestamptz, text, uuid, text
) from public;

create or replace function public.revoke_bonus_credit_grant(
  p_grant_id uuid,
  p_description text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant public.bonus_credit_grants%rowtype;
  v_revoked bigint;
begin
  select grant_row.* into v_grant
  from public.bonus_credit_grants grant_row
  where grant_row.id = p_grant_id;

  if not found or v_grant.revoked_at is not null then
    return 0;
  end if;

  perform public.reconcile_bonus_credit_grants(v_grant.user_id);

  select grant_row.* into v_grant
  from public.bonus_credit_grants grant_row
  where grant_row.id = p_grant_id
  for update;

  v_revoked := v_grant.remaining_microusd;

  if v_revoked > 0 and v_grant.credit_account_id is not null then
    perform public.post_bonus_credit_adjustment(
      v_grant.user_id,
      v_grant.credit_account_id,
      -v_revoked,
      'adjustment',
      'revoke:' || v_grant.id::text,
      p_description,
      jsonb_build_object('bonus_credit_grant_id', v_grant.id, 'source', v_grant.source)
    );
  end if;

  update public.bonus_credit_grants
  set remaining_microusd = 0,
      revoked_at = now()
  where id = p_grant_id;

  return v_revoked;
end;
$$;

revoke all on function public.revoke_bonus_credit_grant(uuid, text) from public;

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

commit;
