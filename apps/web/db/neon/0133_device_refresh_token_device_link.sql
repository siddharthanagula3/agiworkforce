-- Link a refresh-token family to the device it was issued to.
--
-- Without this, a desktop or mobile device could only be signed out by revoking
-- every credential on the account: device_refresh_tokens carried user_id and
-- family_id but nothing identifying the device, so "revoke this laptop" and
-- "sign out everywhere" were the same query. The issuing route already holds
-- device_id and device_name from the authorization code, so recording them
-- costs nothing and makes per-device revocation a scoped update.
alter table public.device_refresh_tokens
  add column if not exists device_id text,
  add column if not exists device_name text;

comment on column public.device_refresh_tokens.device_id is
  'Device that redeemed the authorization code. Null for families issued before 0133; those can only be revoked account-wide.';

create index if not exists idx_device_refresh_tokens_device
  on public.device_refresh_tokens (user_id, device_id)
  where device_id is not null;
