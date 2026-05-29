create table if not exists public.token_credits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  subscription_id uuid references public.subscriptions(id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  credits_allocated_cents integer not null default 0,
  credits_used_cents integer not null default 0,
  flagship_daily_cap_cents integer not null default 0,
  flagship_used_today_cents integer not null default 0,
  flagship_cap_reset_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_token_credits_user_id on public.token_credits(user_id);
create index if not exists idx_token_credits_period
  on public.token_credits(user_id, period_start, period_end);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  credit_account_id uuid not null references public.token_credits(id),
  transaction_type text not null
    check (transaction_type = any (array[
      'allocation', 'deduction', 'reset', 'refund', 'purchase', 'adjustment', 'bonus'
    ])),
  amount_cents integer not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index if not exists idx_credit_transactions_account_id
  on public.credit_transactions(credit_account_id);
