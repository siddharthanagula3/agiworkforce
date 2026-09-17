-- Reversal of 0204 : stop joining first-time single sign-on users to the workspace.
--
-- WHAT THIS COSTS: people who sign in through a workspace connection for the
-- first time land outside it again until an admin adds them. Existing members,
-- including those this migration's code already joined, keep their membership.

begin;

alter table public.sso_connections
  drop constraint if exists sso_connections_jit_default_role_check;
alter table public.sso_connections
  drop column if exists jit_default_role,
  drop column if exists jit_provisioning_enabled;

delete from public.schema_migrations
 where filename = '0204_sso_jit_provisioning.sql';

commit;
