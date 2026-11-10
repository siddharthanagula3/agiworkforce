-- Reversal of 0402: restore 0229's approval equivalence on break-glass grants.
--
-- WHAT THIS COSTS: an approved grant can no longer be revoked before it lapses,
-- and the expiry sweep can no longer close one, because both keep the approval
-- fields that the equivalence allows only on 'approved'. Revoked or expired
-- rows that kept their approval make the restored constraint fail to add, so
-- this reversal stops there instead of clearing that approval history; decide
-- what to do with those rows before running it.

begin;

alter table public.support_access_grants
  drop constraint if exists support_access_grants_approval_is_complete;

alter table public.support_access_grants
  add constraint support_access_grants_approval_is_complete check (
    (status = 'approved') =
    (approved_by_user_id is not null and decided_at is not null and expires_at is not null)
  );

delete from public.schema_migrations
 where filename = '0402_support_access_grant_lifecycle.sql';

commit;
