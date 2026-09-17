import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  WorkspaceControlsLayer,
  WorkspacePolicyOverride,
  WorkspacePolicyOverrideSubject,
} from '@agiworkforce/types';
import { parseWorkspaceControlsLayer } from '@/lib/services/organization-policy-service';

interface PolicyOverrideRow {
  id: string;
  organization_id: string;
  subject_type: WorkspacePolicyOverrideSubject;
  subject_id: string;
  layer: unknown;
  updated_at: unknown;
}

const OVERRIDE_COLUMNS =
  'o.id, o.organization_id, o.subject_type, o.subject_id, o.layer, o.updated_at';

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

function formatOverride(row: PolicyOverrideRow): WorkspacePolicyOverride {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    layer: parseWorkspaceControlsLayer(row.layer),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listPolicyOverrides(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<WorkspacePolicyOverride[]> {
  const rows = await db.query<PolicyOverrideRow>(
    `select ${OVERRIDE_COLUMNS}
       from public.organization_policy_overrides o
      where o.organization_id = $1
      order by o.subject_type asc, o.subject_id asc`,
    [organizationId],
  );
  return rows.map(formatOverride);
}

/**
 * The overrides that bind one member: their user exception, every role they
 * hold (membership role, additional roles, roles granted through a directory
 * group) and every directory group they belong to.
 */
export async function readApplicablePolicyOverrides(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<WorkspacePolicyOverride[]> {
  const rows = await db.query<PolicyOverrideRow>(
    `with member_groups as (
       select gm.group_id
         from public.scim_provisioned_users su
         join public.scim_group_members gm
           on gm.scim_user_id = su.id
          and gm.organization_id = su.organization_id
        where su.organization_id = $1
          and su.linked_user_id = $2
          and su.active
     ), member_roles as (
       select r.id
         from public.organization_members m
         join public.organization_roles r
           on r.organization_id is null
          and r.key = case m.role when 'owner' then 'primary_owner' else m.role end
        where m.organization_id = $1 and m.user_id = $2
       union
       select mr.role_id
         from public.organization_member_roles mr
        where mr.organization_id = $1 and mr.user_id = $2
       union
       select gr.role_id
         from public.organization_group_roles gr
         join member_groups g on g.group_id = gr.group_id
        where gr.organization_id = $1
     )
     select ${OVERRIDE_COLUMNS}
       from public.organization_policy_overrides o
      where o.organization_id = $1
        and exists (
          select 1 from public.organization_members m
           where m.organization_id = $1 and m.user_id = $2
        )
        and (
          (o.subject_type = 'user' and o.subject_id = $2)
          or (o.subject_type = 'role' and o.subject_id in (select id::text from member_roles))
          or (o.subject_type = 'group' and o.subject_id in (select group_id::text from member_groups))
        )`,
    [organizationId, userId],
  );
  return rows.map(formatOverride);
}

export interface UpsertPolicyOverrideInput {
  organizationId: string;
  subjectType: WorkspacePolicyOverrideSubject;
  subjectId: string;
  layer: WorkspaceControlsLayer;
  actorUserId: string;
}

export async function upsertPolicyOverride(
  db: DatabaseAdapter,
  input: UpsertPolicyOverrideInput,
): Promise<WorkspacePolicyOverride> {
  const [row] = await db.query<PolicyOverrideRow>(
    `insert into public.organization_policy_overrides as o
       (organization_id, subject_type, subject_id, layer, created_by_user_id, updated_by_user_id)
     values ($1, $2, $3, $4::jsonb, $5, $5)
     on conflict (organization_id, subject_type, subject_id) do update
        set layer = excluded.layer,
            updated_by_user_id = excluded.updated_by_user_id
     returning ${OVERRIDE_COLUMNS}`,
    [
      input.organizationId,
      input.subjectType,
      input.subjectId,
      JSON.stringify(input.layer),
      input.actorUserId,
    ],
  );
  if (!row) {
    throw new Error(
      `organization_policy_overrides upsert returned no row for ${input.organizationId}`,
    );
  }
  return formatOverride(row);
}

export async function deletePolicyOverride(
  db: DatabaseAdapter,
  organizationId: string,
  overrideId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.organization_policy_overrides
      where organization_id = $1 and id = $2
      returning id`,
    [organizationId, overrideId],
  );
  return rows.length > 0;
}

export async function policySubjectExists(
  db: DatabaseAdapter,
  organizationId: string,
  subjectType: WorkspacePolicyOverrideSubject,
  subjectId: string,
): Promise<boolean> {
  const statement =
    subjectType === 'user'
      ? `select 1 from public.organization_members where organization_id = $1 and user_id = $2 limit 1`
      : subjectType === 'group'
        ? `select 1 from public.scim_groups where organization_id = $1 and id::text = $2 limit 1`
        : `select 1 from public.organization_roles
            where id::text = $2 and (organization_id = $1 or organization_id is null) limit 1`;
  const rows = await db.query<Record<string, unknown>>(statement, [organizationId, subjectId]);
  return rows.length > 0;
}
