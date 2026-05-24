create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  email text,
  plan text,
  billing_interval text,
  source text,
  status text default 'pending',
  joined_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint waitlist_user_plan_unique unique (user_id, plan)
);

create index if not exists idx_waitlist_email on public.waitlist(email);
create index if not exists idx_waitlist_user_id on public.waitlist(user_id);

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  max_uses integer not null default 1,
  current_uses integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  metadata jsonb
);

create table if not exists public.beta_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.beta_invites(id) on delete cascade,
  user_id text not null,
  redeemed_at timestamptz not null default now(),
  surface text,
  source text,
  constraint beta_redemptions_unique unique (invite_id, user_id)
);

create table if not exists public.cloud_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  country text,
  device_model text,
  device_tier text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create table if not exists public.cloud_managed_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'other',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloud_managed_waitlist_unique unique (email, source)
);
