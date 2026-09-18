import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClientIp, recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  assertWorkspaceRevisionUnchanged,
  readExpectedWorkspaceRevision,
  readWorkspaceRevision,
  withWorkspaceRevisionHeaders,
} from '@/lib/server/workspace-revision';
import { readJsonBody } from '@/lib/read-json-body';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  diffAdminPolicy,
  getEffectiveOrganizationPolicy,
  readOrganizationPolicy,
  upsertOrganizationPolicy,
  type AdminPolicyInput,
} from '@/lib/services/organization-policy-service';
import type { AdminPolicy, WorkspaceControls } from '@agiworkforce/types';
import { ControlsPatchSchema } from './controls-schema';
import { isIpAllowed, isValidCidr } from '@/lib/services/ip-allow-list';
import { invalidateIpAllowListCache } from '@/lib/services/organization-ip-allow-list-cache';
import { resolveMfaEnrolled } from '@/lib/mfa-policy-gate';

const MFA_GATE_EXEMPT_OWNER_OPTIONS = { mfaGateExemptForOwner: true } as const;

function cidrList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export const runtime = 'nodejs';

const PrivacyModeSchema = z.enum(['local', 'byok', 'managed']);
const SyncSurfaceSchema = z.enum(['web', 'desktop', 'mobile']);
const SecretHandlingSchema = z.enum(['warn', 'redact', 'block']);
const MAX_IP_ALLOW_LIST_ENTRIES = 100;
const CidrSchema = z.string().refine(isValidCidr, 'Invalid IP address or CIDR block');
const IpAllowListSchema = z.array(CidrSchema).max(MAX_IP_ALLOW_LIST_ENTRIES);
const PolicyPatchSchema = z
  .object({
    defaultPrivacyMode: PrivacyModeSchema,
    allowedPrivacyModes: z.array(PrivacyModeSchema).min(1).max(3),
    allowManagedCompute: z.boolean(),
    requireLocalToByokPreview: z.boolean(),
    chatSyncSurfaces: z.array(SyncSurfaceSchema).min(1).max(3),
    allowCliCloudSync: z.boolean(),
    allowVsCodeCloudSync: z.boolean(),
    allowChromeCloudSync: z.boolean(),
    auditExportEnabled: z.boolean(),
    retentionDays: z.number().int().min(1).max(3650),
    retentionEnforced: z.boolean(),
    externalSharingEnabled: z.boolean(),
    allowMemory: z.boolean(),
    secretHandling: SecretHandlingSchema,
    requireMfa: z.boolean(),
    monthlySpendCapCents: z.number().int().positive().nullable(),
    zeroDataRetentionOnly: z.boolean(),
    ipAllowList: IpAllowListSchema,
    controls: ControlsPatchSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one policy field to change',
  });

export interface OrganizationPolicyResponse {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  policy: AdminPolicy;
  revision: number;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function mergeControls(
  current: WorkspaceControls,
  patch: z.infer<typeof ControlsPatchSchema> | undefined,
): WorkspaceControls {
  if (!patch) return current;
  return {
    featureAccess: { ...current.featureAccess, ...patch.featureAccess },
    defaultModelId:
      patch.defaultModelId !== undefined ? patch.defaultModelId : current.defaultModelId,
    maxReasoningEffort:
      patch.maxReasoningEffort !== undefined
        ? patch.maxReasoningEffort
        : current.maxReasoningEffort,
    allowedCountries:
      patch.allowedCountries !== undefined
        ? dedupe(patch.allowedCountries.map((code) => code.toUpperCase())).sort()
        : current.allowedCountries,
    allowedSurfaces:
      patch.allowedSurfaces !== undefined
        ? patch.allowedSurfaces && dedupe(patch.allowedSurfaces)
        : current.allowedSurfaces,
  };
}

/**
 * Refuses a patch that would leave the requester unable to reach this route
 * again. `requireMfa` and `ipAllowList` are enforced on every authenticated
 * request once saved (see `assertMfaPolicy` / `assertIpAllowList`), so an
 * admin who turns on either without accounting for their own session has no
 * self-service way back in.
 */
async function assertPolicyChangeWontLockOutRequester(
  policy: AdminPolicyInput,
  userId: string,
  request: NextRequest,
): Promise<void> {
  if (policy.requireMfa) {
    const enrolled = await resolveMfaEnrolled(userId);
    if (!enrolled) {
      throw createError.validation(
        'Enrol in two-factor authentication first, then require it for the workspace.',
      );
    }
  }

  if (policy.ipAllowList.length > 0) {
    const clientIp = getClientIp(request);
    if (!isIpAllowed(clientIp, policy.ipAllowList)) {
      throw createError.validation(
        clientIp
          ? `This list would lock out your own connection at ${clientIp}. Add it to the allow list before saving.`
          : 'Your current network address could not be determined, so this allow list cannot be saved safely.',
      );
    }
  }
}

/**
 * The database enforces `default_privacy_mode = any (allowed_privacy_modes)`.
 * Checking it here first turns a constraint violation into an actionable
 * message, and keeps the two rules from drifting apart silently.
 */
function assertPolicyCoherent(policy: AdminPolicyInput): void {
  if (!policy.allowedPrivacyModes.includes(policy.defaultPrivacyMode)) {
    throw createError.validation(
      `The default privacy mode "${policy.defaultPrivacyMode}" must be one of the allowed privacy modes.`,
    );
  }
  if (policy.allowManagedCompute && !policy.allowedPrivacyModes.includes('managed')) {
    throw createError.validation(
      'Allow the Managed Cloud privacy mode before turning on AGI-managed compute, or members would be blocked by their own workspace policy.',
    );
  }
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, MFA_GATE_EXEMPT_OWNER_OPTIONS);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const effective = await getEffectiveOrganizationPolicy(db, membership.organizationId);
  const [permissions, revision] = await Promise.all([
    resolveOrganizationPermissions(membership.organizationId, userId),
    readWorkspaceRevision(db, membership.organizationId),
  ]);

  const payload: OrganizationPolicyResponse = {
    organizationId: membership.organizationId,
    configured: effective.configured,
    canManagePolicy: permissions.has('policy.manage'),
    currentUserRole: membership.role,
    policy: effective.policy,
    revision,
  };

  return withWorkspaceRevisionHeaders(NextResponse.json(payload), revision) as NextResponse;
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

  const expectedRevision = readExpectedWorkspaceRevision(request);
  const body = await readJsonBody(request);
  const parsed = PolicyPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid workspace policy', parsed.error.issues);
  }

  // Read the revision before the merge below, so the policy this patch is
  // layered onto is the one the caller saw. A concurrent save moves the counter
  // and this write is refused rather than silently erasing it.
  await assertWorkspaceRevisionUnchanged(db, membership.organizationId, expectedRevision);

  // Merge onto the CURRENT effective policy, never onto the table's column
  // defaults. A patch that touches one field must not materialize a row whose
  // untouched fields silently switch off managed compute for the workspace.
  const before = await readOrganizationPolicy(db, membership.organizationId);
  const current = await getEffectiveOrganizationPolicy(db, membership.organizationId);
  const next: AdminPolicyInput = {
    defaultPrivacyMode: parsed.data.defaultPrivacyMode ?? current.policy.defaultPrivacyMode,
    allowedPrivacyModes: dedupe(
      parsed.data.allowedPrivacyModes ?? current.policy.allowedPrivacyModes,
    ),
    allowManagedCompute: parsed.data.allowManagedCompute ?? current.policy.allowManagedCompute,
    requireLocalToByokPreview:
      parsed.data.requireLocalToByokPreview ?? current.policy.requireLocalToByokPreview,
    chatSyncSurfaces: dedupe(parsed.data.chatSyncSurfaces ?? current.policy.chatSyncSurfaces),
    allowCliCloudSync: parsed.data.allowCliCloudSync ?? current.policy.allowCliCloudSync,
    allowVsCodeCloudSync: parsed.data.allowVsCodeCloudSync ?? current.policy.allowVsCodeCloudSync,
    allowChromeCloudSync: parsed.data.allowChromeCloudSync ?? current.policy.allowChromeCloudSync,
    auditExportEnabled: parsed.data.auditExportEnabled ?? current.policy.auditExportEnabled,
    retentionDays: parsed.data.retentionDays ?? current.policy.retentionDays,
    retentionEnforced: parsed.data.retentionEnforced ?? current.policy.retentionEnforced,
    externalSharingEnabled:
      parsed.data.externalSharingEnabled ?? current.policy.externalSharingEnabled,
    allowMemory: parsed.data.allowMemory ?? current.policy.allowMemory,
    secretHandling: parsed.data.secretHandling ?? current.policy.secretHandling,
    requireMfa: parsed.data.requireMfa ?? current.policy.requireMfa,
    monthlySpendCapCents:
      parsed.data.monthlySpendCapCents !== undefined
        ? parsed.data.monthlySpendCapCents
        : current.policy.monthlySpendCapCents,
    zeroDataRetentionOnly:
      parsed.data.zeroDataRetentionOnly ?? current.policy.zeroDataRetentionOnly,
    ipAllowList: parsed.data.ipAllowList ?? current.policy.ipAllowList,
    controls: mergeControls(current.policy.controls, parsed.data.controls),
    metadata: current.policy.metadata ?? {},
  };

  await assertPolicyChangeWontLockOutRequester(next, userId, request);
  assertPolicyCoherent(next);

  const policy = await upsertOrganizationPolicy(db, membership.organizationId, next);
  invalidateIpAllowListCache(membership.organizationId);
  const changed = diffAdminPolicy(before, policy);

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'organization_admin_policy',
      resourceId: membership.organizationId,
      role: membership.role,
      status: before ? 'updated' : 'created',
      changedKeys: Object.keys(changed),
      ...(changed['ipAllowList']
        ? {
            ipAllowListBefore: cidrList(changed['ipAllowList'].from),
            ipAllowListAfter: cidrList(changed['ipAllowList'].to),
          }
        : {}),
    },
  });

  const revision = await readWorkspaceRevision(db, membership.organizationId);
  const payload: OrganizationPolicyResponse = {
    organizationId: membership.organizationId,
    configured: true,
    canManagePolicy: true,
    currentUserRole: membership.role,
    policy,
    revision,
  };

  return withWorkspaceRevisionHeaders(NextResponse.json(payload), revision) as NextResponse;
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
