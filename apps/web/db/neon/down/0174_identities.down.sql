-- Reversal of 0174 — drop public.identities.
--
-- WHAT THIS COSTS: nothing live while clerk is the only provider. The mapping
-- is an identity function for clerk and packages/platform/identity resolves a
-- clerk subject without reading the table, so dropping it returns to the
-- pre-0174 state where the provider subject is the user id.
--
-- WHAT THIS WOULD COST LATER: after a second provider's subjects are written
-- here, this reversal destroys the only record of which account each of those
-- subjects belongs to, and those users can no longer be resolved at all. Do
-- not run it once a non-clerk row exists; take a restore instead.

begin;

alter table if exists public.identities no force row level security;
alter table if exists public.identities disable row level security;

-- Restores what the database's default ACL would have granted on this table,
-- so the reversal leaves no privilege footprint of its own before the drop.
grant insert, select, update, delete on public.identities to app_rls;

drop index if exists idx_identities_user_id;
drop index if exists idx_identities_provider_user;
drop index if exists idx_identities_provider_subject;

alter table if exists public.identities
  drop constraint if exists identities_subject_not_blank;
alter table if exists public.identities
  drop constraint if exists identities_provider_not_blank;

drop table if exists public.identities;

delete from public.schema_migrations
 where filename = '0174_identities.sql';

commit;
