-- Reversal of 0378 : personal monthly spend limits are removed.
--
-- WHAT THIS COSTS: every saved personal spend limit is deleted, and credits past
-- the plan limits are admitted up to the full bonus and purchased headroom again.
-- prepaid_credit_balances_microusd is restored exactly as 0298 defined it.

begin;

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

drop function if exists public.personal_overage_spent_microusd(text);

drop policy if exists personal_spend_limits_owner on public.personal_spend_limits;
drop trigger if exists set_personal_spend_limits_updated_at on public.personal_spend_limits;
alter table if exists public.personal_spend_limits disable row level security;
drop table if exists public.personal_spend_limits;

delete from public.schema_migrations
 where filename = '0378_personal_spend_limit.sql';

commit;
