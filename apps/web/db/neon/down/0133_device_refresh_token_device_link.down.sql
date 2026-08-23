-- Reversal of 0133 — unlink refresh-token families from their device.
--
-- WHAT THIS COSTS: per-device sign-out stops working. Every family reverts to
-- being identifiable only by user, so revoking one laptop again means revoking
-- every credential on the account. No credential is invalidated by this file.

begin;

drop index if exists public.idx_device_refresh_tokens_device;

alter table if exists public.device_refresh_tokens
  drop column if exists device_name;

alter table if exists public.device_refresh_tokens
  drop column if exists device_id;

delete from public.schema_migrations
 where filename = '0133_device_refresh_token_device_link.sql';

commit;
