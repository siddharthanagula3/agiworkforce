create table if not exists public.shared_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_id text not null,
  title text not null default 'Shared Session',
  model_id text,
  provider text,
  messages jsonb not null default '[]'::jsonb,
  total_messages integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_shared_sessions_owner_id
  on public.shared_sessions(owner_id);

create index if not exists idx_shared_sessions_expires_at
  on public.shared_sessions(expires_at);
