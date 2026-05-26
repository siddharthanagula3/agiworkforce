-- Migration 0023: 2FA / TOTP support
-- Stores encrypted TOTP secrets and hashed backup codes per user.
-- Secrets are AES-256-GCM encrypted server-side before insert (TOTP_ENCRYPTION_KEY env).
-- Backup codes are SHA-256 hashed; plaintext is shown once at setup then discarded.

create table if not exists public.user_two_factor (
  user_id             text        primary key,
  totp_secret_enc     text        not null,              -- AES-GCM encrypted Base32 secret (base64, IV prepended)
  backup_codes_hashed text[]      not null default '{}', -- SHA-256 hashes of remaining unused backup codes
  enabled             boolean     not null default false,
  enabled_at          timestamptz,
  backup_codes_generated_at timestamptz,
  last_verified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_user_two_factor_user_id
  on public.user_two_factor (user_id);

comment on table  public.user_two_factor              is 'Per-user TOTP 2FA state; secrets encrypted at rest.';
comment on column public.user_two_factor.totp_secret_enc is 'AES-256-GCM ciphertext: base64(IV[12] || ciphertext). Decrypted with TOTP_ENCRYPTION_KEY.';
comment on column public.user_two_factor.backup_codes_hashed is 'SHA-256 hashes of unused backup codes. Remove element on use.';
