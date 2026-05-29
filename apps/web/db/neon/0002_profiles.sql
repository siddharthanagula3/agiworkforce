create table if not exists public.profiles (
  id text primary key,
  email text,
  display_name text,
  avatar_url text,
  stripe_customer_id text,
  routing_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_profiles_stripe_customer_id
  on public.profiles(stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_profiles_email
  on public.profiles(email);
