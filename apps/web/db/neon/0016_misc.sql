create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  message text not null,
  type text not null default 'info'
    check (type = any (array['info', 'success', 'warning', 'error'])),
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id
  on public.notifications(user_id, is_read, created_at desc);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  subject text,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  flag_name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_unique unique (user_id, flag_name)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null,
  referral_code text not null unique,
  referred_email text,
  referred_user_id text,
  status text not null default 'pending',
  reward_type text,
  reward_amount numeric,
  reward_issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  quantity integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_user_id
  on public.usage_events(user_id, created_at desc);

create table if not exists public.email_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  email text not null unique,
  marketing_emails boolean not null default true,
  product_updates boolean not null default true,
  security_alerts boolean not null default true,
  weekly_digest boolean not null default false,
  unsubscribe_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messaging_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  platform text not null,
  config jsonb,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messaging_connections_unique unique (user_id, platform)
);

create table if not exists public.conversation_tags (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id text not null,
  tag text not null,
  confidence numeric(3,2) default 0.0,
  classified_at timestamptz not null default now(),
  constraint conversation_tags_unique unique (conversation_id, user_id)
);
