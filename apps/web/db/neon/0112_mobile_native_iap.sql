-- 0112 — native App Store / Google Play purchase receipts.
--
-- Store product IDs stay in deployment configuration. This migration owns
-- only durable account binding, receipt idempotency, and lifecycle state.

begin;

create table if not exists public.mobile_iap_accounts (
  user_id text primary key references public.profiles(id) on delete cascade,
  app_account_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobile_iap_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  product_key text not null,
  product_id text not null,
  product_kind text not null check (product_kind in ('subscription', 'top_up')),
  store_transaction_id text not null,
  purchase_token_hash text not null,
  original_transaction_id text,
  plan_tier text,
  units_granted integer not null default 0 check (units_granted >= 0),
  intended_amount_cents integer not null default 0 check (intended_amount_cents >= 0),
  refunded_amount_cents integer not null default 0 check (
    refunded_amount_cents >= 0 and refunded_amount_cents <= intended_amount_cents
  ),
  status text not null check (status in (
    'pending', 'active', 'granted', 'already_processed', 'refunded', 'revoked', 'expired'
  )),
  environment text,
  purchased_at timestamptz,
  expires_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, store_transaction_id),
  unique (platform, purchase_token_hash),
  check (
    (product_kind = 'subscription' and plan_tier is not null and units_granted = 0)
    or
    (product_kind = 'top_up' and plan_tier is null and units_granted > 0)
  )
);

create index if not exists idx_mobile_iap_transactions_user
  on public.mobile_iap_transactions(user_id, created_at desc);
create index if not exists idx_mobile_iap_transactions_original
  on public.mobile_iap_transactions(platform, original_transaction_id)
  where original_transaction_id is not null;

create table if not exists public.mobile_iap_notification_receipts (
  platform text not null check (platform in ('ios', 'android')),
  notification_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (platform, notification_id)
);

alter table public.mobile_iap_accounts enable row level security;
alter table public.mobile_iap_accounts force row level security;
alter table public.mobile_iap_transactions enable row level security;
alter table public.mobile_iap_transactions force row level security;
alter table public.mobile_iap_notification_receipts enable row level security;
alter table public.mobile_iap_notification_receipts force row level security;

-- Billing receipts are service-owned. No app_rls policy is intentional: users
-- receive only the bounded /api/mobile/iap response, never raw store tokens.

comment on table public.mobile_iap_accounts is
  'Stable UUID bound to one AGI account and supplied to StoreKit/Play Billing purchase flows.';
comment on column public.mobile_iap_transactions.purchase_token_hash is
  'SHA-256 of the store purchase token/JWS. Raw consumable tokens are not retained after verification.';

commit;
