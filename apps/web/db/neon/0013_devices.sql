create table if not exists public.device_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  device_name text,
  device_type text,
  user_code text not null,
  user_id text,
  user_email text,
  user_name text,
  status text not null default 'pending'
    check (status = any (array['pending', 'approved', 'denied', 'expired', 'consumed'])),
  access_token text,
  refresh_token text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_auth_codes_user_code
  on public.device_authorization_codes(user_code);
create index if not exists idx_device_auth_codes_device_id
  on public.device_authorization_codes(device_id);

create table if not exists public.desktop_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text,
  platform text check (platform = any (array['macos', 'windows', 'linux'])),
  version text,
  last_seen_at timestamptz,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desktop_devices_user_id on public.desktop_devices(user_id);

create table if not exists public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  platform text,
  name text,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mobile_devices_user_id on public.mobile_devices(user_id);

create table if not exists public.sync_data (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id text not null,
  sync_type text not null,
  data jsonb,
  created_at timestamptz not null default now(),
  constraint sync_data_unique unique (user_id, device_id, sync_type, created_at)
);
