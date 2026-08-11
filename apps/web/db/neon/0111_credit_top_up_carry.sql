-- 0111 — durable purchased-credit carry across subscription periods.
--
-- Purchased top-ups share the cents ledger with plan allowance, but they are
-- not plan allowance: resetting a subscription period must carry the unused
-- purchased portion instead of erasing money the customer bought.

begin;

alter table public.token_credits
  add column if not exists top_up_allocated_cents integer not null default 0;

alter table public.token_credits
  drop constraint if exists token_credits_top_up_allocation_valid;
alter table public.token_credits
  add constraint token_credits_top_up_allocation_valid
  check (
    top_up_allocated_cents >= 0
    and top_up_allocated_cents <= credits_allocated_cents
  );

create index if not exists idx_credit_transactions_top_up_expiry
  on public.credit_transactions (user_id, created_at)
  where transaction_type = 'purchase';

-- Checkout's synchronous and asynchronous success events can race. The
-- session-specific receipt makes the balance grant atomic: if both callers
-- pass their preliminary read, the losing add_credits statement rolls back at
-- this constraint instead of incrementing the account twice.
create unique index if not exists idx_credit_transactions_top_up_session_receipt
  on public.credit_transactions (user_id, description)
  where transaction_type = 'purchase'
    and description like 'Credit top-up purchase cs_%';

-- Legacy purchases predate the separately tracked purchased allocation. Carry
-- only what is still present in the account; this cannot manufacture balance.
with purchased as (
  select credit_account_id, sum(amount_cents)::integer as purchased_cents
  from public.credit_transactions
  where transaction_type = 'purchase' and amount_cents > 0
  group by credit_account_id
)
update public.token_credits account
set top_up_allocated_cents = least(
      purchased.purchased_cents,
      greatest(account.credits_allocated_cents - account.credits_used_cents, 0)
    )
from purchased
where purchased.credit_account_id = account.id
  and account.top_up_allocated_cents = 0;

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

-- A top-up refund must retire the purchased allocation even when the customer
-- has already spent some or all of it. Otherwise that refunded purchase can be
-- mistaken for carryable balance at the next renewal. The ordinary
-- handle_refund function remains unchanged for subscription-charge refunds.
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

comment on column public.token_credits.top_up_allocated_cents is
  'Purchased-credit portion of credits_allocated_cents. Unused purchases carry across periods and purchases older than 12 months are excluded at renewal.';

commit;
