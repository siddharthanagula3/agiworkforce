import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  isOrganizationPermission,
  resolveWorkspaceControls,
  type AuthorizationSubject,
  type EffectiveWorkspacePolicy,
  type OrganizationPermission,
  type OrganizationRole,
  type WorkspaceFeature,
  type WorkspacePolicyOverride,
  type WorkspacePolicyOverrideSubject,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import {
  parseWorkspaceControlsLayer,
  readLayeredOrganizationPolicy,
} from '@/lib/services/organization-policy-service';
import { readApplicablePolicyOverrides } from '@/lib/services/organization-policy-override-service';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

const MISSING_RELATION = '42P01';

// The layering tables ship as forward migrations that may not be applied. A
// workspace without them is ungoverned, not unreadable.
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === MISSING_RELATION;
}

export interface PolicyScopeSelectors {
  projectId?: string | null;
  deviceId?: string | null;
}

interface PolicyOverrideRow {
  id: string;
  organization_id: string;
  subject_type: WorkspacePolicyOverrideSubject;
  subject_id: string;
  layer: unknown;
  updated_at: unknown;
}

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

async function readProjectAndDeviceOverrides(
  db: DatabaseAdapter,
  organizationId: string,
  selectors: PolicyScopeSelectors,
): Promise<WorkspacePolicyOverride[]> {
  const projectId = selectors.projectId ?? null;
  const deviceId = selectors.deviceId ?? null;
  if (!projectId && !deviceId) return [];
  const rows = await db.query<PolicyOverrideRow>(
    `select o.id, o.organization_id, o.subject_type, o.subject_id, o.layer, o.updated_at
       from public.organization_policy_overrides o
      where o.organization_id = $1
        and (
          (o.subject_type = 'project' and $2::text is not null and o.subject_id = $2)
          or (o.subject_type = 'device' and $3::text is not null and o.subject_id = $3)
        )`,
    [organizationId, projectId, deviceId],
  );
  return rows.map(formatOverride);
}

// Project and device are resolved here rather than in
// readApplicablePolicyOverrides because they depend on the request.
export async function readScopedPolicyOverrides(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
  selectors: PolicyScopeSelectors = {},
): Promise<WorkspacePolicyOverride[]> {
  try {
    const [subjectOverrides, contextOverrides] = await Promise.all([
      readApplicablePolicyOverrides(db, organizationId, userId),
      readProjectAndDeviceOverrides(db, organizationId, selectors),
    ]);
    return [...subjectOverrides, ...contextOverrides];
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
    logger.warn(
      { organizationId },
      '[authorization] policy layer tables are not present; workspace treated as unlayered',
    );
    return [];
  }
}

export interface AuthorizationFacts extends AuthorizationSubject {
  userId: string;
  role: OrganizationRole | null;
  controls: EffectiveWorkspacePolicy;
}

export interface AuthorizationSubjectOptions extends PolicyScopeSelectors {
  organizationId?: string | null;
  request?: { headers: { get(name: string): string | null } };
  /**
   * The features the workspace plan includes. Null, the default, is a plan
   * that restricts no feature; an empty array is a plan that includes none.
   */
  entitledFeatures?: readonly WorkspaceFeature[] | null;
  withheldByRollout?: readonly WorkspaceFeature[];
}

async function readMembership(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<OrganizationRole | null> {
  const [row] = await db.query<{ role: OrganizationRole }>(
    `select role
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  return row?.role ?? null;
}

async function readPermissions(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<Set<OrganizationPermission>> {
  const [row] = await db.query<{ permissions: unknown }>(
    `select public.organization_member_permissions($1::uuid, $2) as permissions`,
    [organizationId, userId],
  );
  const permissions = Array.isArray(row?.permissions) ? row.permissions : [];
  return new Set(permissions.filter(isOrganizationPermission));
}

// organization_members.role = 'owner' is the Primary Owner, of which there is
// exactly one; the assignable Owner role appears in the permission set instead.
export async function resolveAuthorizationFacts(
  db: DatabaseAdapter,
  userId: string,
  options: AuthorizationSubjectOptions = {},
): Promise<AuthorizationFacts> {
  const organizationId =
    options.organizationId !== undefined
      ? options.organizationId
      : await resolveActiveOrganizationId(db, userId, options.request);

  if (!organizationId) {
    return {
      userId,
      organizationId: null,
      role: null,
      isMember: false,
      isPrimaryOwner: false,
      permissions: new Set<OrganizationPermission>(),
      entitledFeatures: options.entitledFeatures ?? null,
      controls: resolveWorkspaceControls(DEFAULT_WORKSPACE_CONTROLS, []),
      policyRevision: 0,
      ...(options.withheldByRollout ? { withheldByRollout: options.withheldByRollout } : {}),
    };
  }

  const role = await readMembership(db, organizationId, userId);
  if (!role) {
    return {
      userId,
      organizationId,
      role: null,
      isMember: false,
      isPrimaryOwner: false,
      permissions: new Set<OrganizationPermission>(),
      entitledFeatures: options.entitledFeatures ?? null,
      controls: resolveWorkspaceControls(DEFAULT_WORKSPACE_CONTROLS, []),
      policyRevision: 0,
      ...(options.withheldByRollout ? { withheldByRollout: options.withheldByRollout } : {}),
    };
  }

  const [permissions, layered] = await Promise.all([
    readPermissions(db, organizationId, userId),
    readLayeredOrganizationPolicy(db, organizationId).catch((error: unknown) => {
      if (!isMissingRelation(error)) throw error;
      return null;
    }),
  ]);

  const overrides = layered?.hasOverrides
    ? await readScopedPolicyOverrides(db, organizationId, userId, options)
    : [];
  const revision = layered?.policy.revision ?? 0;

  return {
    userId,
    organizationId,
    role,
    isMember: true,
    isPrimaryOwner: role === 'owner',
    permissions,
    entitledFeatures: options.entitledFeatures ?? null,
    controls: resolveWorkspaceControls(
      layered?.policy.controls ?? DEFAULT_WORKSPACE_CONTROLS,
      overrides,
      revision,
    ),
    policyRevision: revision,
    ...(options.withheldByRollout ? { withheldByRollout: options.withheldByRollout } : {}),
  };
}
