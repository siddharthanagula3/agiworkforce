import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readJsonBody } from '@/lib/read-json-body';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  getEffectiveOrganizationPolicy,
  readLayeredOrganizationPolicy,
  readOrganizationPolicy,
  readWorkspaceCodeControls,
  upsertOrganizationPolicy,
  withWorkspaceCodeControls,
  type AdminPolicyInput,
} from '@/lib/services/organization-policy-service';
import { readApplicablePolicyOverrides } from '@/lib/services/organization-policy-override-service';
import {
  resolveWorkspaceCodeControls,
  WORKSPACE_CODE_TOGGLE_KEYS,
  type WorkspaceCodeControls,
  type WorkspaceCodePolicyResponse,
} from '@agiworkforce/types';

export const runtime = 'nodejs';

const MFA_GATE_EXEMPT_OWNER_OPTIONS = { mfaGateExemptForOwner: true } as const;
const MAX_CODE_HOSTS = 200;
const HostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
    'Use a hostname such as example.com or *.example.com',
  );

const CodeControlsPatchSchema = z
  .object({
    allowDesktopCloudSync: z.boolean(),
    allowGithubConnection: z.boolean(),
    allowMcpServers: z.boolean(),
    allowAutomatedReview: z.boolean(),
    allowedMcpServers: z.array(HostSchema).max(MAX_CODE_HOSTS),
    allowedEgressHosts: z.array(HostSchema).max(MAX_CODE_HOSTS),
    sessionRetentionDays: z.number().int().min(1).max(3650).nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one Code control to change',
  });

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function mergeCodeControls(
  current: WorkspaceCodeControls,
  patch: z.infer<typeof CodeControlsPatchSchema>,
): WorkspaceCodeControls {
  return {
    allowDesktopCloudSync: patch.allowDesktopCloudSync ?? current.allowDesktopCloudSync,
    allowGithubConnection: patch.allowGithubConnection ?? current.allowGithubConnection,
    allowMcpServers: patch.allowMcpServers ?? current.allowMcpServers,
    allowAutomatedReview: patch.allowAutomatedReview ?? current.allowAutomatedReview,
    allowedMcpServers: dedupe(patch.allowedMcpServers ?? current.allowedMcpServers),
    allowedEgressHosts: dedupe(patch.allowedEgressHosts ?? current.allowedEgressHosts),
    sessionRetentionDays:
      patch.sessionRetentionDays !== undefined
        ? patch.sessionRetentionDays
        : current.sessionRetentionDays,
  };
}

/**
 * An MCP allow list with `allowMcpServers` off would read as a permission that
 * is never consulted, so the pair is refused rather than silently reconciled.
 */
function assertCodeControlsCoherent(controls: WorkspaceCodeControls): void {
  if (!controls.allowMcpServers && controls.allowedMcpServers.length > 0) {
    throw createError.validation(
      'Turn MCP servers back on, or clear the allowed server list: a list that nothing may reach cannot take effect.',
    );
  }
}

function changedCodeKeys(before: WorkspaceCodeControls, after: WorkspaceCodeControls): string[] {
  return (Object.keys(after) as (keyof WorkspaceCodeControls)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function policyInputFrom(
  policy: Awaited<ReturnType<typeof getEffectiveOrganizationPolicy>>['policy'],
  code: WorkspaceCodeControls,
): AdminPolicyInput {
  return {
    defaultPrivacyMode: policy.defaultPrivacyMode,
    allowedPrivacyModes: [...policy.allowedPrivacyModes],
    allowManagedCompute: policy.allowManagedCompute,
    requireLocalToByokPreview: policy.requireLocalToByokPreview,
    chatSyncSurfaces: [...policy.chatSyncSurfaces],
    allowCliCloudSync: policy.allowCliCloudSync,
    allowVsCodeCloudSync: policy.allowVsCodeCloudSync,
    allowChromeCloudSync: policy.allowChromeCloudSync,
    auditExportEnabled: policy.auditExportEnabled,
    retentionDays: policy.retentionDays,
    retentionEnforced: policy.retentionEnforced,
    externalSharingEnabled: policy.externalSharingEnabled,
    allowMemory: policy.allowMemory,
    secretHandling: policy.secretHandling,
    requireMfa: policy.requireMfa,
    monthlySpendCapCents: policy.monthlySpendCapCents,
    zeroDataRetentionOnly: policy.zeroDataRetentionOnly,
    ipAllowList: [...policy.ipAllowList],
    controls: policy.controls,
    metadata: withWorkspaceCodeControls(policy.metadata, code),
  };
}

async function respond(
  db: Parameters<typeof readApplicablePolicyOverrides>[0],
  organizationId: string,
  userId: string,
  configured: boolean,
  canManagePolicy: boolean,
  policy: Awaited<ReturnType<typeof getEffectiveOrganizationPolicy>>['policy'],
): Promise<NextResponse> {
  const controls = readWorkspaceCodeControls(policy.metadata);
  const layered = await readLayeredOrganizationPolicy(db, organizationId);
  const overrides = layered?.hasOverrides
    ? await readApplicablePolicyOverrides(db, organizationId, userId)
    : [];
  const payload: WorkspaceCodePolicyResponse = {
    organizationId,
    configured,
    canManagePolicy,
    controls,
    effective: resolveWorkspaceCodeControls(controls, overrides, layered?.policy.revision ?? 0),
  };
  return NextResponse.json(payload);
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, MFA_GATE_EXEMPT_OWNER_OPTIONS);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const effective = await getEffectiveOrganizationPolicy(db, membership.organizationId);
  const permissions = await resolveOrganizationPermissions(membership.organizationId, userId);

  return respond(
    db,
    membership.organizationId,
    userId,
    effective.configured,
    permissions.has('policy.manage'),
    effective.policy,
  );
}

async function handlePatch(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, MFA_GATE_EXEMPT_OWNER_OPTIONS);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const permissions = await resolveOrganizationPermissions(membership.organizationId, userId);
  if (!permissions.has('policy.manage')) {
    throw createError
      .forbidden('Your workspace role does not allow changing workspace policy.')
      .asUserSafe();
  }

  const parsed = CodeControlsPatchSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid Code controls', parsed.error.issues);
  }

  // Without an existing row, writing these would also materialize the table's
  // restrictive column defaults for every other control. See upsertOrganizationPolicy.
  const before = await readOrganizationPolicy(db, membership.organizationId);
  if (!before) {
    throw createError.validation(
      'Save the workspace policy before setting Code connections, so this change does not also apply the restrictive defaults for every other control.',
    );
  }

  const current = await getEffectiveOrganizationPolicy(db, membership.organizationId);
  const previous = readWorkspaceCodeControls(current.policy.metadata);
  const next = mergeCodeControls(previous, parsed.data);
  assertCodeControlsCoherent(next);

  const policy = await upsertOrganizationPolicy(
    db,
    membership.organizationId,
    policyInputFrom(current.policy, next),
  );

  const changedKeys = changedCodeKeys(previous, next);
  const turnedOff = WORKSPACE_CODE_TOGGLE_KEYS.filter((key) => next[key] === false);
  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'organization_code_controls',
      resourceId: membership.organizationId,
      role: membership.role,
      status: 'updated',
      changedKeys,
      ...(turnedOff.length > 0 ? { reason: `off: ${turnedOff.join(', ')}` } : {}),
    },
  });

  return respond(db, membership.organizationId, userId, true, true, policy);
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
