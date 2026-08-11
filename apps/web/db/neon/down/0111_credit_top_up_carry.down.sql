-- Reversal of 0111 — restore period-only allocation behavior.

begin;

drop function if exists public.handle_top_up_refund(text, integer, text);

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
  if p_amount_cents <= 0 then raise exception 'credit amount must be positive'; end if;
  if p_transaction_type not in ('purchase', 'adjustment', 'refund', 'bonus') then
    raise exception 'invalid transaction type: %', p_transaction_type;
  end if;
  update public.token_credits
  set credits_allocated_cents = credits_allocated_cents + p_amount_cents,
      credits_used_cents = greatest(0, credits_used_cents),
      updated_at = now()
  where id = p_account_id and user_id = p_user_id;
  if not found then raise exception 'credit account not found for user'; end if;
  insert into public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) values (p_user_id, p_account_id, p_amount_cents, p_transaction_type, p_description);
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
declare v_account_id uuid;
begin
  insert into public.token_credits (
    user_id, subscription_id, period_start, period_end,
    credits_allocated_cents, credits_used_cents,
    flagship_used_today_cents, flagship_cap_reset_date
  ) values (
    p_user_id, p_subscription_id, p_period_start, p_period_end,
    p_credits_allocated_cents, 0, 0, current_date
  )
  on conflict (user_id, subscription_id, period_start, period_end)
  do update set
    credits_allocated_cents = p_credits_allocated_cents,
    credits_used_cents = 0,
    flagship_used_today_cents = 0,
    flagship_cap_reset_date = current_date,
    updated_at = now()
  returning id into v_account_id;
  insert into public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) values (
    p_user_id, v_account_id, 'reset', p_credits_allocated_cents,
    'credit reset for new billing period'
  );
  return v_account_id;
end;
$$;

drop index if exists public.idx_credit_transactions_top_up_expiry;
drop index if exists public.idx_credit_transactions_top_up_session_receipt;
alter table public.token_credits drop constraint if exists token_credits_top_up_allocation_valid;
alter table public.token_credits drop column if exists top_up_allocated_cents;
delete from public.schema_migrations where filename = '0111_credit_top_up_carry.sql';

commit;
