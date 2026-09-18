-- Reversal of 0233, forget which refresh-token families were compromised.
--
-- The families stay revoked, because 0080's revoked_at is what ends them and
-- this migration never touched it. What is lost is why: after this, a family
-- emptied by a replayed token is indistinguishable from one the user signed out
-- of, and nothing refuses to issue into it again.

begin;

alter table public.device_refresh_tokens
  drop constraint if exists device_refresh_tokens_compromise_recorded;

drop index if exists public.idx_device_refresh_tokens_compromised_family;

alter table public.device_refresh_tokens
  drop column if exists compromised_at;

alter table public.device_refresh_tokens
  drop column if exists compromised_reason;

delete from public.schema_migrations
 where filename = '0233_refresh_family_compromise.sql';

commit;
