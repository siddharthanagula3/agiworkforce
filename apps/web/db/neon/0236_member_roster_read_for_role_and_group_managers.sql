-- =============================================================================
-- Migration 0236: let role and group managers read the member roster.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : 0200 gave `organization_members` one administrative read policy,
--          gated on `members.manage`. Assigning a role to somebody, or mapping
--          a directory group onto one, means naming a member, so every route
--          that does it has to read the roster first. Holders of `roles.manage`
--          or `groups.manage` do not hold `members.manage`, which is the point
--          of splitting them, so those routes cannot run under RLS at all and
--          have stayed on a privileged connection that applies no tenant
--          boundary of its own.
--
-- Shape  : the same policy, widened to the three permissions that legitimately
--          need the roster. It is a SELECT policy only: `roles.manage` still
--          confers no power to add, remove or re-role anybody, which
--          `organization_members_admin_write` continues to gate on
--          `members.manage` alone. Read is granted through
--          `app_has_org_permission`, the same permission-grid mechanism 0200
--          uses, so a permission revoked in the grid is revoked here with it
--          and there is no second list to keep in step.
--
-- Empty  : No data changes. `members.manage` holders read exactly what they
--          read before; nobody loses access.
--
-- Depends: 0015 (organization_members), 0054 (organization_members_self_read),
--          0200 (app_has_org_permission, organization_members_admin_read)
-- =============================================================================

begin;

drop policy if exists organization_members_admin_read on public.organization_members;
create policy organization_members_admin_read
  on public.organization_members for select to app_rls
  using (
    public.app_has_org_permission(organization_id, 'members.manage')
    or public.app_has_org_permission(organization_id, 'roles.manage')
    or public.app_has_org_permission(organization_id, 'groups.manage')
  );

comment on table public.organization_members is
  'The roster. Readable by holders of members.manage, roles.manage or groups.manage, because assigning a role or mapping a group means naming a member; writable only by members.manage.';

commit;

-- =============================================================================
-- VERIFICATION: run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. A roles.manage holder who lacks members.manage sees the roster:
-- --    SET LOCAL app.user_id = '<user with roles.manage only>';
-- --    SELECT count(*) FROM public.organization_members
-- --     WHERE organization_id = '<org>';            -- EXPECT: the full roster
--
-- -- 2. The same holder still cannot change it:
-- --    UPDATE public.organization_members SET role = 'admin'
-- --     WHERE organization_id = '<org>' AND user_id = '<other>';
-- --    EXPECT: 0 rows updated
--
-- -- 3. A member with none of the three sees only their own row:
-- --    SET LOCAL app.user_id = '<plain member>';
-- --    SELECT count(*) FROM public.organization_members
-- --     WHERE organization_id = '<org>';            -- EXPECT: 1
-- =============================================================================
