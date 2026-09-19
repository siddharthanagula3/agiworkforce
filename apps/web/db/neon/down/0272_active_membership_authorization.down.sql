-- Reinstates pre-0272 authorization, including its inactive-member access defect.
-- Use only as part of an explicitly reviewed rollback; forward repair is safer.
begin;

create or replace function public.organization_member_permissions(
  p_organization_id uuid,
  p_user_id text
)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with membership as (
    select m.role
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_user_id
  ),
  held as (
    select r.permissions
      from membership m
      join public.organization_roles r
        on r.organization_id is null
       and r.key = case m.role when 'owner' then 'primary_owner' else m.role end
    union all
    select r.permissions
      from membership m
      join public.organization_member_roles mr
        on mr.organization_id = p_organization_id
       and mr.user_id = p_user_id
      join public.organization_roles r on r.id = mr.role_id
    union all
    select r.permissions
      from membership m
      join public.scim_provisioned_users su
        on su.organization_id = p_organization_id
       and su.linked_user_id = p_user_id
       and su.active
      join public.scim_group_members gm
        on gm.scim_user_id = su.id
       and gm.organization_id = p_organization_id
      join public.organization_group_roles gr
        on gr.group_id = gm.group_id
       and gr.organization_id = p_organization_id
      join public.organization_roles r on r.id = gr.role_id
  )
  select public.organization_permission_closure(
    coalesce(
      array(
        select distinct permission
          from held, unnest(held.permissions) as permission
      ),
      array[]::text[]
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_app_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role
    FROM public.organization_members m
   WHERE m.organization_id = public.current_app_org_id()
     AND m.user_id = public.current_app_user_id()
   LIMIT 1;
$$;

create or replace function public.app_row_is_visible(row_user_id text, row_org_id uuid)
returns boolean
language sql
stable
as $$
  select (
        row_user_id = public.current_app_user_id()
        and row_org_id is not distinct from public.current_app_org_id()
      )
      or (
        row_org_id is not null
        and row_org_id = public.current_app_org_id()
        and public.app_has_org_permission(row_org_id, 'content.govern')
      );
$$;

delete from public.schema_migrations where filename = '0272_active_membership_authorization.sql';
commit;
