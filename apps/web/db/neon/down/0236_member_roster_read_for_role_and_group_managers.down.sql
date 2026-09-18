-- Reversal of 0236, narrow the member roster back to members.manage.
--
-- 0200's policy, restored verbatim. Any route that reads the roster under RLS
-- while holding only roles.manage or groups.manage stops seeing rows after
-- this, so it fails closed rather than leaking: move those routes back before
-- reversing, not after.

begin;

drop policy if exists organization_members_admin_read on public.organization_members;
create policy organization_members_admin_read
  on public.organization_members for select to app_rls
  using (public.app_has_org_permission(organization_id, 'members.manage'));

delete from public.schema_migrations
 where filename = '0236_member_roster_read_for_role_and_group_managers.sql';

commit;
