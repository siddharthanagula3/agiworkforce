// The authorization precedence contract every surface imports. Five ordered
// stages, and a later stage may only narrow what an earlier stage allowed.

import {
  BUILT_IN_ORGANIZATION_ROLES,
  builtInRoleKeyForMembershipRole,
  expandOrganizationPermissions,
  ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
  type OrganizationPermission,
} from './permissions';
import type { OrganizationRole } from './index';
import type { SourceSurface } from '../suite-contracts';
import type {
  WorkspaceControls,
  WorkspaceFeature,
  WorkspaceReasoningEffort,
} from './workspace-controls';
import { WORKSPACE_REASONING_EFFORTS } from './workspace-controls';

export const AUTHORIZATION_STAGES = [
  'membership',
  'entitlement',
  'permission',
  'policy',
  'rollout',
] as const;

export type AuthorizationStage = (typeof AUTHORIZATION_STAGES)[number];

export interface AuthorizationStageContract {
  stage: AuthorizationStage;
  question: string;
  source: string;
  /** What a later stage may do to this stage's answer. Always 'narrow'. */
  effectOnEarlierStages: 'narrow';
}

export const AUTHORIZATION_PRECEDENCE: readonly AuthorizationStageContract[] = Object.freeze([
  {
    stage: 'membership',
    question: 'Does this account belong to this workspace?',
    source: 'organization_members',
    effectOnEarlierStages: 'narrow',
  },
  {
    stage: 'entitlement',
    question: 'Does the workspace plan include this capability?',
    source: 'subscription and seat entitlements',
    effectOnEarlierStages: 'narrow',
  },
  {
    stage: 'permission',
    question: 'Does this member hold the permission this action requires?',
    source: 'organization_member_permissions',
    effectOnEarlierStages: 'narrow',
  },
  {
    stage: 'policy',
    question: 'Has an administrator turned this off for this member?',
    source: 'organization_admin_policies and organization_policy_overrides',
    effectOnEarlierStages: 'narrow',
  },
  {
    stage: 'rollout',
    question: 'Has this capability been released to this workspace?',
    source: 'feature flags',
    effectOnEarlierStages: 'narrow',
  },
] as const);

export const ENTERPRISE_DENIAL_CODES = [
  'not_a_member',
  'plan_does_not_include',
  'permission_denied',
  'primary_owner_only',
  'policy_denied',
  'feature_disabled',
  'surface_not_allowed',
  'region_not_allowed',
  'reasoning_effort_capped',
  'rollout_withheld',
  'self_escalation_denied',
  'policy_unavailable',
] as const;

export type EnterpriseDenialCode = (typeof ENTERPRISE_DENIAL_CODES)[number];

export const ENTERPRISE_DENIAL_STAGE: Readonly<Record<EnterpriseDenialCode, AuthorizationStage>> =
  Object.freeze({
    not_a_member: 'membership',
    plan_does_not_include: 'entitlement',
    permission_denied: 'permission',
    primary_owner_only: 'permission',
    self_escalation_denied: 'permission',
    policy_denied: 'policy',
    feature_disabled: 'policy',
    surface_not_allowed: 'policy',
    region_not_allowed: 'policy',
    reasoning_effort_capped: 'policy',
    policy_unavailable: 'policy',
    rollout_withheld: 'rollout',
  });

// Every enterprise refusal on every surface. A surface renders `message`;
// support and audit read `code` and `blockingRule`.
export interface EnterpriseDenial {
  code: EnterpriseDenialCode;
  stage: AuthorizationStage;
  message: string;
  organizationId: string | null;
  policyRevision: number;
  requiredPermission?: OrganizationPermission;
  feature?: WorkspaceFeature;
  surface?: SourceSurface;
  blockingRule?: string;
}

export type AuthorizationDecision =
  | {
      allowed: true;
      organizationId: string | null;
      policyRevision: number;
      grantedBy: readonly string[];
    }
  | { allowed: false; denial: EnterpriseDenial };

export interface PermissionGrant {
  /** Where the permissions came from: a role key, a group id, a membership role. */
  source: string;
  permissions: readonly OrganizationPermission[];
}

export interface EffectivePermissions {
  permissions: ReadonlySet<OrganizationPermission>;
  /** Permission to the grants that conferred it, for the explanation endpoint. */
  grantedBy: Readonly<Record<string, readonly string[]>>;
  /** Permissions a grant offered that policy or the owner rule took back. */
  withheld: Readonly<Record<string, EnterpriseDenialCode>>;
}

// The union of every grant, minus the Primary Owner permissions and anything
// denied. A deny is a ceiling, so one more group can never lift it.
export function resolveEffectivePermissions(input: {
  grants: readonly PermissionGrant[];
  isPrimaryOwner: boolean;
  deniedPermissions?: readonly OrganizationPermission[];
}): EffectivePermissions {
  const denied = new Set(input.deniedPermissions ?? []);
  const permissions = new Set<OrganizationPermission>();
  const grantedBy: Record<string, string[]> = {};
  const withheld: Record<string, EnterpriseDenialCode> = {};

  for (const grant of input.grants) {
    for (const permission of grant.permissions) {
      if (!ORGANIZATION_PERMISSIONS.includes(permission)) continue;
      if (!input.isPrimaryOwner && PRIMARY_OWNER_ONLY_PERMISSIONS.includes(permission)) {
        withheld[permission] = 'primary_owner_only';
        continue;
      }
      if (denied.has(permission)) {
        withheld[permission] = 'policy_denied';
        continue;
      }
      permissions.add(permission);
      (grantedBy[permission] ??= []).push(grant.source);
    }
  }

  for (const sources of Object.values(grantedBy)) sources.sort();

  return {
    permissions,
    grantedBy: Object.freeze(grantedBy),
    withheld: Object.freeze(withheld),
  };
}

// A grant may only pass on permissions the granter holds. The WITH CHECK of
// both grant tables enforces the same rule; this copy produces the message.
export function permissionsBeyondGranter(
  granterPermissions: Iterable<OrganizationPermission>,
  requestedPermissions: Iterable<OrganizationPermission>,
): OrganizationPermission[] {
  const held = new Set(granterPermissions);
  return [...new Set(requestedPermissions)].filter((permission) => !held.has(permission)).sort();
}

// Joining a workspace confers the member bundle, so handing it out is what members.manage means.
// Everything above it answers to the ceiling: what the granter does not hold, nobody receives.
export function membershipRolePermissionsBeyondGranter(
  granterPermissions: Iterable<string>,
  role: OrganizationRole,
): OrganizationPermission[] {
  const held = expandOrganizationPermissions(granterPermissions);
  const baseline = new Set<OrganizationPermission>(BUILT_IN_ORGANIZATION_ROLES.member.permissions);
  const conferred = BUILT_IN_ORGANIZATION_ROLES[builtInRoleKeyForMembershipRole(role)].permissions;
  return [...new Set(conferred)]
    .filter((permission) => !held.has(permission) && !baseline.has(permission))
    .sort();
}

export interface SelfEscalationAttempt {
  granterUserId: string;
  subjectUserId: string;
  escalatedPermissions: readonly OrganizationPermission[];
  /** A granter raising their own access is the case that warrants an alert. */
  isSelfGrant: boolean;
}

// Returns null when the grant stays inside what the granter already holds.
export function detectPermissionEscalation(input: {
  granterUserId: string;
  subjectUserId: string;
  granterPermissions: Iterable<OrganizationPermission>;
  requestedPermissions: Iterable<OrganizationPermission>;
}): SelfEscalationAttempt | null {
  const escalated = permissionsBeyondGranter(input.granterPermissions, input.requestedPermissions);
  if (escalated.length === 0) return null;
  return {
    granterUserId: input.granterUserId,
    subjectUserId: input.subjectUserId,
    escalatedPermissions: escalated,
    isSelfGrant: input.granterUserId === input.subjectUserId,
  };
}

export interface AuthorizationSubject {
  organizationId: string | null;
  isMember: boolean;
  isPrimaryOwner: boolean;
  permissions: ReadonlySet<OrganizationPermission> | readonly OrganizationPermission[];
  // Null is a plan that restricts no feature; an empty array is a plan that
  // includes none of them. The two must not collapse into one.
  entitledFeatures: readonly WorkspaceFeature[] | null;
  controls: WorkspaceControls;
  policyRevision: number;
  /** Features held back by rollout. Withholding only; never a grant. */
  withheldByRollout?: readonly WorkspaceFeature[];
}

export interface AuthorizationAsk {
  permission?: OrganizationPermission;
  feature?: WorkspaceFeature;
  surface?: SourceSurface;
  country?: string | null;
  reasoningEffort?: WorkspaceReasoningEffort;
}

const PERSONAL_SCOPE_SOURCE = 'personal_scope';

function denial(
  code: EnterpriseDenialCode,
  message: string,
  subject: AuthorizationSubject,
  extra: Partial<EnterpriseDenial> = {},
): AuthorizationDecision {
  return {
    allowed: false,
    denial: {
      code,
      stage: ENTERPRISE_DENIAL_STAGE[code],
      message,
      organizationId: subject.organizationId,
      policyRevision: subject.policyRevision,
      ...extra,
    },
  };
}

// Stages run in AUTHORIZATION_PRECEDENCE order and the first refusal is the
// answer. Personal scope has no workspace to govern it, so it allows.
export function evaluateAuthorization(
  subject: AuthorizationSubject,
  ask: AuthorizationAsk,
): AuthorizationDecision {
  const held =
    subject.permissions instanceof Set
      ? subject.permissions
      : new Set(subject.permissions as readonly OrganizationPermission[]);

  if (subject.organizationId === null) {
    return {
      allowed: true,
      organizationId: null,
      policyRevision: 0,
      grantedBy: [PERSONAL_SCOPE_SOURCE],
    };
  }

  if (!subject.isMember) {
    return denial('not_a_member', 'You are not a member of this workspace.', subject);
  }

  if (ask.feature && subject.entitledFeatures && !subject.entitledFeatures.includes(ask.feature)) {
    return denial(
      'plan_does_not_include',
      'This workspace plan does not include that capability.',
      subject,
      { feature: ask.feature },
    );
  }

  if (ask.permission) {
    if (!subject.isPrimaryOwner && PRIMARY_OWNER_ONLY_PERMISSIONS.includes(ask.permission)) {
      return denial(
        'primary_owner_only',
        'Only the workspace Primary Owner can do that.',
        subject,
        { requiredPermission: ask.permission },
      );
    }
    if (!held.has(ask.permission)) {
      return denial('permission_denied', 'Your workspace role does not allow that.', subject, {
        requiredPermission: ask.permission,
      });
    }
  }

  if (ask.feature && subject.controls.featureAccess[ask.feature] === false) {
    return denial('feature_disabled', 'A workspace administrator turned that off.', subject, {
      feature: ask.feature,
      blockingRule: `featureAccess.${ask.feature}`,
    });
  }

  const allowedSurfaces = subject.controls.allowedSurfaces;
  if (ask.surface && allowedSurfaces && !allowedSurfaces.includes(ask.surface)) {
    return denial(
      'surface_not_allowed',
      'A workspace administrator does not allow this app to be used for that.',
      subject,
      { surface: ask.surface, blockingRule: 'allowedSurfaces' },
    );
  }

  const allowedCountries = subject.controls.allowedCountries;
  if (ask.country !== undefined && allowedCountries.length > 0) {
    if (!ask.country || !allowedCountries.includes(ask.country)) {
      return denial(
        'region_not_allowed',
        'A workspace administrator does not allow that from this location.',
        subject,
        { blockingRule: 'allowedCountries' },
      );
    }
  }

  const cap = subject.controls.maxReasoningEffort;
  if (
    ask.reasoningEffort &&
    cap &&
    WORKSPACE_REASONING_EFFORTS.indexOf(ask.reasoningEffort) >
      WORKSPACE_REASONING_EFFORTS.indexOf(cap)
  ) {
    return denial(
      'reasoning_effort_capped',
      'A workspace administrator caps how much thinking a turn may use.',
      subject,
      { blockingRule: 'maxReasoningEffort' },
    );
  }

  if (ask.feature && subject.withheldByRollout?.includes(ask.feature)) {
    return denial(
      'rollout_withheld',
      'That has not been released to this workspace yet.',
      subject,
      {
        feature: ask.feature,
      },
    );
  }

  return {
    allowed: true,
    organizationId: subject.organizationId,
    policyRevision: subject.policyRevision,
    grantedBy: ask.permission ? [ask.permission] : [],
  };
}

export type DefaultModelResolution = 'not_set' | 'permitted' | 'not_permitted';

// A default model is a preference, never a grant: it says where a conversation
// starts, and only the model policy says what the member may reach.
export function resolveDefaultModelId(
  defaultModelId: string | null | undefined,
  allowance: {
    allowedModelIds?: readonly string[] | null;
    blockedModelIds?: readonly string[] | null;
  },
): { modelId: string | null; resolution: DefaultModelResolution } {
  if (!defaultModelId) return { modelId: null, resolution: 'not_set' };
  if (allowance.blockedModelIds?.includes(defaultModelId)) {
    return { modelId: null, resolution: 'not_permitted' };
  }
  const allowed = allowance.allowedModelIds;
  if (allowed && allowed.length > 0 && !allowed.includes(defaultModelId)) {
    return { modelId: null, resolution: 'not_permitted' };
  }
  return { modelId: defaultModelId, resolution: 'permitted' };
}

export interface AuthorizationExplanation {
  organizationId: string | null;
  policyRevision: number;
  isPrimaryOwner: boolean;
  permissions: readonly OrganizationPermission[];
  grantedBy: Readonly<Record<string, readonly string[]>>;
  withheld: Readonly<Record<string, EnterpriseDenialCode>>;
  precedence: readonly AuthorizationStageContract[];
}

// Why a member can do what they can: permissions in force, what conferred each,
// what was taken back and by which stage.
export function explainAuthorization(input: {
  organizationId: string | null;
  policyRevision: number;
  isPrimaryOwner: boolean;
  effective: EffectivePermissions;
}): AuthorizationExplanation {
  return {
    organizationId: input.organizationId,
    policyRevision: input.policyRevision,
    isPrimaryOwner: input.isPrimaryOwner,
    permissions: [...input.effective.permissions].sort(),
    grantedBy: input.effective.grantedBy,
    withheld: input.effective.withheld,
    precedence: AUTHORIZATION_PRECEDENCE,
  };
}
