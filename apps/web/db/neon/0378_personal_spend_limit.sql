-- =============================================================================
-- Migration 0378: a personal monthly spend limit on credits used past the plan
--
-- Why    : Settings > Usage offers a monthly spend limit, as the leaders do.
--          Past the plan's limits a request is admitted on bonus or purchased
--          credits (is_overage, 0281/0346). Nothing let an account holder put a
--          ceiling on how many of those credits a calendar month may use; the
--          only cap was the workspace one (0142), which never applies to a
--          personal account.
--
-- Shape  : personal_spend_limits holds one optional ceiling per account, in
--          microUSD like the rest of the ledger, written by the account holder
--          through app_rls under an owner-only policy.
--          personal_overage_spent_microusd sums this UTC month's overage
--          requests: settled ones at their actual cost, unresolved and in-flight
--          ones at their estimate, so a request whose outcome is unknown still
--          counts against the ceiling.
--          prepaid_credit_balances_microusd is redefined so its
--          overage_headroom_microusd never exceeds what the ceiling has left.
--          Every admission path reads that headroom under the per-user
--          reservation lock (0346, 0347), so the ceiling is enforced in the
--          database at admission, exactly and atomically, and a failure to read
--          it fails the reservation rather than admitting the request. The
--          balances it reports are unchanged.
--
-- Depends: 0037 (current_app_user_id), 0056 (managed_usage_requests), 0076
--          (set_row_updated_at), 0182 (microUSD costs), 0281 (is_overage), 0298
--          (prepaid_credit_balances_microusd, overage_in_flight_microusd)
-- =============================================================================

begin;

create table if not exists public.personal_spend_limits (
  user_id text primary key references public.profiles(id) on delete cascade,
  monthly_cap_microusd bigint not null check (monthly_cap_microusd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.personal_spend_limits is
  'Optional calendar-month (UTC) ceiling on credits an account uses past its plan limits. Enforced at admission through prepaid_credit_balances_microusd.';

drop trigger if exists set_personal_spend_limits_updated_at on public.personal_spend_limits;
create trigger set_personal_spend_limits_updated_at
  before update on public.personal_spend_limits
  for each row execute function public.set_row_updated_at();

alter table public.personal_spend_limits enable row level security;
alter table public.personal_spend_limits force row level security;

revoke all on public.personal_spend_limits from public;
grant select, insert, update, delete on public.personal_spend_limits to app_rls;

drop policy if exists personal_spend_limits_owner on public.personal_spend_limits;
create policy personal_spend_limits_owner
  on public.personal_spend_limits
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

create or replace function public.personal_overage_spent_microusd(p_user_id text)
returns bigint
language sql
stable
as $$
  select coalesce(sum(
           case
             when request_row.status = 'completed'
               then coalesce(request_row.actual_cost_microusd, request_row.estimated_cost_microusd)
             else request_row.estimated_cost_microusd
           end
         ), 0)::bigint
  from public.managed_usage_requests request_row
  where request_row.user_id = p_user_id
    and request_row.is_overage
    and request_row.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    and request_row.status = any (array[
      'reserving', 'reserved', 'provider_started', 'completed', 'outcome_unknown'
    ]);
$$;
revoke all on function public.personal_overage_spent_microusd(text) from public;
grant execute on function public.personal_overage_spent_microusd(text) to app_rls;

comment on function public.personal_overage_spent_microusd(text) is
  'Credits (in microUSD) used past the plan limits this UTC month: settled overage requests at actual cost, unresolved and in-flight ones at their estimate.';

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
  spend_cap as (
    select greatest(
             limit_row.monthly_cap_microusd - public.personal_overage_spent_microusd(p_user_id),
             0
           )::bigint as remaining
    from public.personal_spend_limits limit_row
    where limit_row.user_id = p_user_id
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
         least(
           (greatest(drawn.bonus - drawn.in_flight, 0)
             + case
                 when drawn.overage_enabled then greatest(drawn.purchased - drawn.purchased_draw, 0)
                 else 0
               end),
           coalesce((select spend_cap.remaining from spend_cap), 9223372036854775807)
         )::bigint,
         drawn.next_expiry,
         drawn.next_purchase_expiry
  from drawn;
$$;
revoke all on function public.prepaid_credit_balances_microusd(text) from public;
grant execute on function public.prepaid_credit_balances_microusd(text) to app_rls;

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No account is capped by this migration alone:
-- --    select count(*) from public.personal_spend_limits;          -- EXPECT: 0
--
-- -- 2. A ceiling of zero is impossible:
-- --    insert into public.personal_spend_limits values ('<user>', 0);
-- --                                                                -- EXPECT: check violation
--
-- -- 3. With a ceiling, headroom never exceeds what it has left:
-- --    select overage_headroom_microusd
-- --      from public.prepaid_credit_balances_microusd('<user>');
-- --    EXPECT: <= monthly_cap_microusd - personal_overage_spent_microusd('<user>')
-- =============================================================================
