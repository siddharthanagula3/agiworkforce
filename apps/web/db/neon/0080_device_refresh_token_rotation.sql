-- 0080: Rotating, replay-detecting refresh credentials for first-party device auth.
--
-- Raw refresh tokens are returned once and never persisted. A token row remains
-- after use so replay can identify and revoke the whole session family.

create table if not exists public.device_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  user_id text not null,
  user_email text,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid references public.device_refresh_tokens(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_refresh_tokens_family
  on public.device_refresh_tokens(family_id);
create index if not exists idx_device_refresh_tokens_user
  on public.device_refresh_tokens(user_id, created_at desc);
create index if not exists idx_device_refresh_tokens_expiry
  on public.device_refresh_tokens(expires_at);

comment on table public.device_refresh_tokens is
  'Hashed, single-use device refresh credentials. Reuse of a spent token revokes every row in its family.';
comment on column public.device_refresh_tokens.token_hash is
  'SHA-256 of a 256-bit random bearer. The raw credential is never stored.';
