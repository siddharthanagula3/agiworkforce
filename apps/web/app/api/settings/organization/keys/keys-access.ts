import 'server-only';

import type { NextRequest } from 'next/server';
import { canUseBillingPlanCapability, type BillingPlanTier } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';
import { requireOrganizationOwner } from '@/lib/services/organization-membership-service';
import { buildCmekProviderRegistry } from '@/lib/server/organization-encryption-keys';
import {
  CmekProviderUnconfiguredError,
  type CmekKeyDescriptor,
  type OrganizationKeyRecord,
} from '@/lib/crypto/cmek';
import {
  requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess,
  type WorkspaceConsoleAccess,
} from '@/app/api/settings/organization/workspace-access';

export const KEYS_ENDPOINT = '/api/settings/organization/keys';

export interface KeyManagementAccess extends WorkspaceConsoleAccess {
  plan: BillingPlanTier;
}

/**
 * Customer-managed keys are an enterprise control, gated on the same
 * entitlement SSO, SCIM and retention windows are gated on.
 */
async function requireKeyEntitlement(organizationId: string): Promise<BillingPlanTier> {
  const plan = await resolveOrganizationEntitlementPlan(organizationId);
  if (!canUseBillingPlanCapability(plan, 'enterprise_controls')) {
    throw createError
      .forbidden(
        'Managing your own encryption key requires an active Enterprise plan. Contact sales to ' +
          'scope an enterprise contract.',
      )
      .asUserSafe();
  }
  return plan;
}

export async function requireKeyManagement(
  request: NextRequest,
  permission: 'admin.policy.view' | 'admin.policy.manage',
  deniedMessage: string,
): Promise<KeyManagementAccess> {
  const resolved = await requireWorkspaceConsolePermission(request, permission, deniedMessage);
  return { ...resolved, plan: await requireKeyEntitlement(resolved.organizationId) };
}

/**
 * Revocation makes everything this workspace sealed unreadable, which no
 * permission in the grid names. Until one exists it is the Primary Owner's
 * alone, the same check the workspace deletion controls use.
 */
export async function requireKeyOwner(request: NextRequest): Promise<KeyManagementAccess> {
  const resolved = await resolveWorkspaceConsoleAccess(request);
  await requireOrganizationOwner(
    resolved.db,
    resolved.userId,
    resolved.organizationId,
    'revoke this workspace encryption key',
  );
  return { ...resolved, plan: await requireKeyEntitlement(resolved.organizationId) };
}

export function requireProviderClient(descriptor: CmekKeyDescriptor) {
  const client = buildCmekProviderRegistry()[descriptor.provider];
  if (!client) throw new CmekProviderUnconfiguredError(descriptor.provider);
  return client;
}

/**
 * The next version in a workspace's ring, never one it has used before: a
 * repeated version would make two different data keys answer to one id.
 */
export function nextKeyVersion(record: OrganizationKeyRecord | null): string {
  const used = new Set(
    record ? [record.active.version, ...record.retired.map((key) => key.version)] : [],
  );
  const numeric = [...used]
    .map((version) => Number.parseInt(version, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  let next = (numeric.length > 0 ? Math.max(...numeric) : 0) + 1;
  while (used.has(String(next))) next += 1;
  return String(next);
}
