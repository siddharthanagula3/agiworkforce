create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  event_type text not null,
  severity text not null default 'info'
    check (severity = any (array['info', 'warning', 'error', 'critical'])),
  ip_address text,
  user_agent text,
  endpoint text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_audit_logs_user_id
  on public.security_audit_logs(user_id);
create index if not exists idx_security_audit_logs_created_at
  on public.security_audit_logs(created_at desc);

create table if not exists public.revoked_jwts (
  jti text primary key,
  user_id text not null,
  until_exp timestamptz not null,
  reason text,
  revoked_at timestamptz not null default now()
);

create table if not exists public.account_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_sessions_user_id
  on public.account_sessions(user_id);
