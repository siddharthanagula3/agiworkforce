create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  platform text not null,
  download_url text not null,
  signature text,
  notes text,
  pub_date timestamptz,
  file_size_bytes bigint,
  sha256_hash text,
  min_os_version text,
  is_prerelease boolean not null default false,
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint releases_version_platform_unique unique (version, platform)
);

create table if not exists public.release_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.release_downloads (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.releases(id),
  ip_hash text,
  user_agent text,
  country_code text,
  region text,
  referrer text,
  downloaded_at timestamptz not null default now()
);

create index if not exists idx_release_downloads_release_id
  on public.release_downloads(release_id);
