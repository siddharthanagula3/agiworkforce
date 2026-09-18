import 'server-only';

import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';

import { FLAG_OFF_VARIANT } from './flag-definition';
import {
  deleteFlagOverride,
  ensureFlagDefinition,
  getSubjectOverrides,
  listFlagOverrides,
  upsertFlagOverride,
} from './flag-store';
import { TENANT_LOCKDOWN_FLAG_KEY, killSwitchDefinition } from './kill-switches';

const LOCKDOWN_DESCRIPTION =
  'Open unless a workspace is locked down. A workspace held off here reaches no route, agent or model.';

export interface TenantLockdownActor {
  userId: string;
  request: Request;
}

export interface TenantLockdownInput {
  organizationId: string;
  reason: string;
  secondApproverUserId: string;
}

export interface LockedDownTenant {
  organizationId: string;
  lockedUntil: string | null;
}

/**
 * Locking a tenant out is the one control here that can take a paying
 * workspace off the product in a single request, so it is the one control that
 * is not a single operator's to use: a second name from the same allowlist has
 * to be on the action, and it cannot be the operator's own.
 */
function assertSecondApprover(actor: TenantLockdownActor, secondApproverUserId: string): void {
  const approver = secondApproverUserId.trim();
  if (!approver) throw createError.badRequest('A second approver is required');
  if (approver === actor.userId) {
    throw createError.badRequest('The second approver must be another platform operator');
  }
  if (!isPlatformAdmin(approver, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    throw createError.badRequest('The second approver is not a platform operator');
  }
}

async function auditLockdown(
  actor: TenantLockdownActor,
  organizationId: string,
  status: 'locked_down' | 'lifted',
  detail: { reason: string; secondApproverUserId: string },
): Promise<void> {
  await recordAuditEvent({
    userId: actor.userId,
    eventType: 'feature_flag_override_changed',
    severity: 'critical',
    request: actor.request,
    surface: 'operator',
    organizationId,
    detail: {
      resourceType: 'feature_flag',
      resourceId: TENANT_LOCKDOWN_FLAG_KEY,
      status,
      scope: 'workspace',
      organizationId,
      targetUserId: detail.secondApproverUserId,
      reason: detail.reason,
      enabled: status === 'lifted',
    },
  });
}

export async function lockdownTenant(
  actor: TenantLockdownActor,
  input: TenantLockdownInput,
): Promise<LockedDownTenant> {
  assertSecondApprover(actor, input.secondApproverUserId);
  const definition = await ensureFlagDefinition(
    killSwitchDefinition(TENANT_LOCKDOWN_FLAG_KEY, LOCKDOWN_DESCRIPTION),
  );
  if (!definition) {
    throw createError.internal('The lockdown switch could not be prepared. Nothing was changed.');
  }
  await upsertFlagOverride(TENANT_LOCKDOWN_FLAG_KEY, {
    subject: 'workspace',
    subjectId: input.organizationId,
    variant: FLAG_OFF_VARIANT,
    expiresAt: null,
  });
  await auditLockdown(actor, input.organizationId, 'locked_down', {
    reason: input.reason,
    secondApproverUserId: input.secondApproverUserId,
  });
  return { organizationId: input.organizationId, lockedUntil: null };
}

export async function liftTenantLockdown(
  actor: TenantLockdownActor,
  input: TenantLockdownInput,
): Promise<void> {
  assertSecondApprover(actor, input.secondApproverUserId);
  const removed = await deleteFlagOverride(
    TENANT_LOCKDOWN_FLAG_KEY,
    'workspace',
    input.organizationId,
  );
  if (removed === 0) throw createError.notFound('That workspace is not locked down');
  await auditLockdown(actor, input.organizationId, 'lifted', {
    reason: input.reason,
    secondApproverUserId: input.secondApproverUserId,
  });
}

export async function listLockedDownTenants(): Promise<LockedDownTenant[]> {
  const overrides = await listFlagOverrides(TENANT_LOCKDOWN_FLAG_KEY);
  return overrides
    .filter((override) => override.subject === 'workspace' && override.variant === FLAG_OFF_VARIANT)
    .map((override) => ({
      organizationId: override.subjectId,
      lockedUntil: override.expiresAt,
    }));
}

/**
 * The question every request path asks: is this workspace held off right now.
 * A workspace nobody locked, and an unreadable override table, both answer no,
 * so the switch can only ever take something down deliberately.
 */
export async function isTenantLockedDown(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const overrides = await getSubjectOverrides('', organizationId, [TENANT_LOCKDOWN_FLAG_KEY]);
  return overrides.some(
    (override) => override.subject === 'workspace' && override.variant === FLAG_OFF_VARIANT,
  );
}

export async function assertTenantNotLockedDown(organizationId: string | null): Promise<void> {
  if (await isTenantLockedDown(organizationId)) {
    throw createError.forbidden(
      'This workspace is locked down while an incident is investigated. Contact support.',
    );
  }
}

/**
 * Engaged by the platform itself rather than by an operator, for the one case
 * where the tenant is going away: an erasure that has started must not keep
 * serving the workspace it is erasing.
 */
export async function lockdownTenantForErasure(organizationId: string): Promise<void> {
  const definition = await ensureFlagDefinition(
    killSwitchDefinition(TENANT_LOCKDOWN_FLAG_KEY, LOCKDOWN_DESCRIPTION),
  );
  if (!definition) return;
  await upsertFlagOverride(TENANT_LOCKDOWN_FLAG_KEY, {
    subject: 'workspace',
    subjectId: organizationId,
    variant: FLAG_OFF_VARIANT,
    expiresAt: null,
  });
}
