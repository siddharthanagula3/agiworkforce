import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  explainAuthorization,
  isOrganizationPermission,
  resolveEffectivePermissions,
  type AuthorizationExplanation,
  type OrganizationPermission,
  type PermissionGrant,
} from '@agiworkforce/types';
import {
  resolveAuthorizationFacts,
  type AuthorizationSubjectOptions,
} from '@/lib/authorization/subject';

const GRANT_SOURCES = `
  with membership as (
    select m.role
      from public.organization_members m
     where m.organization_id = $1 and m.user_id = $2
  )
  select 'membership:' || r.key as source, r.permissions as permissions
    from membership m
    join public.organization_roles r
      on r.organization_id is null
     and r.key = case m.role when 'owner' then 'primary_owner' else m.role end
  union all
  select 'role:' || r.key, r.permissions
    from public.organization_member_roles mr
    join public.organization_roles r on r.id = mr.role_id
   where mr.organization_id = $1 and mr.user_id = $2
  union all
  select 'group:' || g.display_name || ':' || r.key, r.permissions
    from public.scim_provisioned_users su
    join public.scim_group_members gm
      on gm.scim_user_id = su.id and gm.organization_id = su.organization_id
    join public.scim_groups g on g.id = gm.group_id
    join public.organization_group_roles gr
      on gr.group_id = gm.group_id and gr.organization_id = $1
    join public.organization_roles r on r.id = gr.role_id
   where su.organization_id = $1 and su.linked_user_id = $2 and su.active
  union all
  select 'group:' || g.display_name || ':' || r.key, r.permissions
    from public.organization_group_members wm
    join public.scim_groups g on g.id = wm.group_id
    join public.organization_group_roles gr
      on gr.group_id = wm.group_id and gr.organization_id = $1
    join public.organization_roles r on r.id = gr.role_id
   where wm.organization_id = $1 and wm.user_id = $2`;

export async function readPermissionGrants(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<PermissionGrant[]> {
  const rows = await db.query<{ source: string; permissions: unknown }>(GRANT_SOURCES, [
    organizationId,
    userId,
  ]);
  return rows.map((row) => ({
    source: row.source,
    permissions: (Array.isArray(row.permissions) ? row.permissions : []).filter(
      isOrganizationPermission,
    ),
  }));
}

// What an administrator reads when they ask why a member can or cannot act.
export async function explainMemberAuthorization(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
  options: AuthorizationSubjectOptions = {},
): Promise<AuthorizationExplanation & { deniedPermissions: readonly OrganizationPermission[] }> {
  const facts = await resolveAuthorizationFacts(db, userId, { ...options, organizationId });
  const grants = facts.isMember ? await readPermissionGrants(db, organizationId, userId) : [];
  const effective = resolveEffectivePermissions({
    grants,
    isPrimaryOwner: facts.isPrimaryOwner,
  });
  return {
    ...explainAuthorization({
      organizationId: facts.organizationId,
      policyRevision: facts.policyRevision,
      isPrimaryOwner: facts.isPrimaryOwner,
      effective,
    }),
    deniedPermissions: Object.keys(effective.withheld).filter(isOrganizationPermission),
  };
}
