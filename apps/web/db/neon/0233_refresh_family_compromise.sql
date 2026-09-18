-- 0233 : a refresh-token family that is known to be compromised says so.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0080 chains rotation through replaced_by and revokes the whole family when a
-- spent token is replayed, which is the right response but leaves no record of
-- why. A revoked family and a stolen one are the same three columns afterwards,
-- so nothing downstream can tell a sign-out from a token theft, an operator
-- reading the table cannot either, and a family emptied by a replay could be
-- re-issued into as if the account had simply signed out.
--
-- compromised_at is that record and it is what makes revocation binding rather
-- than advisory: every path that issues into a family checks it, so the family
-- is finished for good and the device has to authenticate again from scratch.
-- The access token it already holds dies with it, because a developer token is
-- only honoured while its family still has a live row
-- (apps/web/lib/server/developer-token.ts), which is the forced
-- reauthentication, not a request the client is free to ignore.
--
-- The reason is a closed vocabulary because it is read by code, not by a human:
-- replayed is 0080's replay detection, device_lost is the account holder saying
-- the machine is gone, admin_revoked is support acting on the account.

begin;

alter table public.device_refresh_tokens
  add column if not exists compromised_at timestamptz;

alter table public.device_refresh_tokens
  add column if not exists compromised_reason text;

alter table public.device_refresh_tokens
  drop constraint if exists device_refresh_tokens_compromise_recorded;

alter table public.device_refresh_tokens
  add constraint device_refresh_tokens_compromise_recorded
  check (
    (compromised_at is null and compromised_reason is null)
    or (
      compromised_at is not null
      and compromised_reason in ('replayed', 'device_lost', 'admin_revoked')
    )
  );

create index if not exists idx_device_refresh_tokens_compromised_family
  on public.device_refresh_tokens(family_id)
  where compromised_at is not null;

comment on column public.device_refresh_tokens.compromised_at is
  'Set on every row of a family the moment the family is known to be compromised. A family carrying it is finished: nothing may be issued into it again.';
comment on column public.device_refresh_tokens.compromised_reason is
  'replayed (a spent token was presented again), device_lost (the account holder reported the device gone), admin_revoked (support acted on the account).';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A compromise needs both columns:
-- --    UPDATE public.device_refresh_tokens SET compromised_at = now()
-- --     WHERE family_id = '<an existing family_id>';
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 2. With a known reason it is accepted:
-- --    UPDATE public.device_refresh_tokens
-- --       SET compromised_at = now(), compromised_reason = 'replayed'
-- --     WHERE family_id = '<the same family_id>';
-- --    EXPECT: UPDATE <the number of rows in that family>
--
-- -- 3. An unknown reason is refused:
-- --    UPDATE public.device_refresh_tokens
-- --       SET compromised_at = now(), compromised_reason = 'because'
-- --     WHERE family_id = '<the same family_id>';
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. Clean up:
-- --    UPDATE public.device_refresh_tokens
-- --       SET compromised_at = null, compromised_reason = null
-- --     WHERE family_id = '<the same family_id>';
-- =============================================================================
