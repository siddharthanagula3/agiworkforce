-- Reversal of 0154 — drop TOTP replay protection.
--
-- WHAT THIS COSTS: a TOTP code becomes reusable for the whole ~90 seconds it
-- stays current again, so a code observed once can be replayed against every
-- 2FA endpoint until it expires. No account data is lost; only the anti-replay
-- record goes.

begin;

alter table public.user_two_factor
  drop column if exists last_totp_step;

delete from public.schema_migrations
 where filename = '0154_two_factor_replay_protection.sql';

commit;
