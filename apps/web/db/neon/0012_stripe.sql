create table if not exists public.processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now(),
  status text not null default 'succeeded',
  error_message text
);

create table if not exists public.credit_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_credit_idempotency_keys_expires
  on public.credit_idempotency_keys(expires_at);
