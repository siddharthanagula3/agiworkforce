-- 0100_admin_role_helper.sql
--
-- One canonical answer to "which roles administer an organization".
--
-- The pair `('owner', 'admin')` is a policy decision, not a constant of the
-- schema: it is the same decision the API gateway makes through
-- `isOrganizationAdminRole()` and the same one every admin-scoped route makes.
-- In SQL it had been retyped at every site that needed it, including inside
-- `app_row_is_visible()` — the single predicate 0073 introduced precisely so
-- twelve policies could not drift apart. A predicate that centralises the
-- twelve policies but inlines the role list has only moved the copy.
--
-- This migration adds the list and the test over it, and rewires
-- `app_row_is_visible()` to use them. `create or replace` keeps the existing
-- signature, so every policy that already references the function picks up the
-- new body with no policy churn — nothing is dropped and no USING clause is
-- retyped, which is the only safe way to touch a live RLS surface.
--
-- NOT changed here: the ~25 policies that pass `array['owner', 'admin']` to
-- `app_has_org_role(uuid, text[])`. Rewriting those means re-stating each
-- policy's USING/WITH CHECK clause, and a transcription slip there is a silent
-- authorization regression for zero behavioural gain. They should pass
-- `public.app_org_admin_roles()` as they are next edited for other reasons;
-- new policies must use it from the start.

-- ---------------------------------------------------------------------------
-- Helper: app_org_admin_roles()
-- The canonical administering roles, as the text[] that
-- `app_has_org_role(organization_id, allowed_roles)` already takes. IMMUTABLE
-- so the planner can fold it into an index-usable predicate rather than
-- re-evaluating it per row.
-- ---------------------------------------------------------------------------
create or replace function public.app_org_admin_roles()
returns text[]
language sql
immutable
as $$
  select array['owner', 'admin']::text[];
$$;

-- ---------------------------------------------------------------------------
-- Helper: app_is_org_admin_role(candidate_role)
-- The scalar form, for statements that already hold a role value.
--
-- `coalesce(..., false)` matters: `null = any (...)` is NULL, and a NULL that
-- flows into a policy is only *usually* indistinguishable from false. Making
-- the unknown role explicitly false means a caller can also use this in a CHECK
-- constraint or an application query without inheriting three-valued logic.
-- ---------------------------------------------------------------------------
create or replace function public.app_is_org_admin_role(candidate_role text)
returns boolean
language sql
immutable
as $$
  select coalesce(candidate_role = any (public.app_org_admin_roles()), false);
$$;

revoke all on function public.app_org_admin_roles() from public;
revoke all on function public.app_is_org_admin_role(text) from public;
grant execute on function public.app_org_admin_roles() to app_rls;
grant execute on function public.app_is_org_admin_role(text) to app_rls;

-- ---------------------------------------------------------------------------
-- 0073's tenancy predicate, with the inlined role pair removed.
--
-- Body is otherwise byte-for-byte the 0073 definition: the owner always sees
-- their own row; an org owner/admin sees rows filed to their ACTIVE
-- organization; anything else is denied.
-- ---------------------------------------------------------------------------
create or replace function public.app_row_is_visible(row_user_id text, row_org_id uuid)
returns boolean
language sql
stable
as $$
  select row_user_id = public.current_app_user_id()
      or (
        row_org_id is not null
        and row_org_id = public.current_app_org_id()
        and public.app_is_org_admin_role(public.current_app_org_role())
      );
$$;

grant execute on function public.app_row_is_visible(text, uuid) to app_rls;
