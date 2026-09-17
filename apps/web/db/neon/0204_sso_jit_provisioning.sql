-- 0204 : join people to their workspace the first time they sign in through its
-- single sign-on connection.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- SCIM adds a member only when the identity provider pushes one. A workspace
-- without directory sync had no way to admit someone who authenticated through
-- its own verified-domain connection, so every first sign-in landed outside the
-- workspace. These two columns let the connection owner decide whether a first
-- enterprise sign-in joins the workspace and with which role. Owner and admin
-- are not grantable this way: elevated access still goes through a person.

begin;

alter table public.sso_connections
  add column if not exists jit_provisioning_enabled boolean not null default true,
  add column if not exists jit_default_role text not null default 'member';

alter table public.sso_connections
  drop constraint if exists sso_connections_jit_default_role_check;
alter table public.sso_connections
  add constraint sso_connections_jit_default_role_check
  check (jit_default_role in ('member', 'viewer'));

commit;
