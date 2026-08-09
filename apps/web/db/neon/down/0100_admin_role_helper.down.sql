-- Reverses 0100_admin_role_helper.sql — put the administering-role pair back
-- inline in the tenancy predicate and retire the two helpers.
--
-- Order is load-bearing: `app_row_is_visible()` is redefined FIRST, so by the
-- time the helpers are dropped nothing calls them. Dropping them first would
-- not error (a SQL function body is not a tracked dependency) — it would leave
-- every one of the twelve policies that go through this predicate raising
-- "function app_is_org_admin_role(text) does not exist" on the next row read,
-- which reads as a total outage of authenticated data access.
--
-- `create or replace` keeps the signature, so no policy is dropped or retyped
-- and the ACL survives; the grant below is 0073's own and is repeated only so
-- this file restores 0073's state when run against a database that never had
-- it.

begin;

-- 0073's definition, byte-for-byte in behaviour: the owner always sees their
-- own row; an org owner/admin sees rows filed to their ACTIVE organization.
create or replace function public.app_row_is_visible(row_user_id text, row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_user_id = public.current_app_user_id()
      or (
        row_org_id is not null
        and row_org_id = public.current_app_org_id()
        and public.current_app_org_role() in ('owner', 'admin')
      );
$$;

grant execute on function public.app_row_is_visible(text, uuid) to app_rls;

drop function if exists public.app_is_org_admin_role(text);
drop function if exists public.app_org_admin_roles();

delete from public.schema_migrations where filename = '0100_admin_role_helper.sql';

commit;
