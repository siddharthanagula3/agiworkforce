import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  deleteSpendLimit,
  readSpendState,
  upsertSpendLimit,
  type SpendState,
} from '@/lib/services/spend-limit-service';

export const runtime = 'nodejs';

const PutSchema = z
  .object({
    // Cents, so the smallest cap is one cent rather than zero. A cap of zero
    // would refuse every turn and is not something anyone means to save.
    monthlyCapCents: z.number().int().min(1).max(100_000_000),
    enforcement: z.enum(['off', 'notify', 'block']),
    alertThresholdPct: z.number().int().min(1).max(100),
  })
  .strict();

export interface SpendLimitResponse {
  organizationId: string;
  canManageLimit: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  state: SpendState;
}

/** Readable by any member: someone refused a turn is entitled to know the reason is a budget rather than a fault. */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  const payload: SpendLimitResponse = {
    organizationId: membership.organizationId,
    canManageLimit: isOrgAdminRole(membership.role),
    currentUserRole: membership.role,
    state: await readSpendState(db, membership.organizationId),
  };
  return NextResponse.json(payload);
}

async function requireAdmin(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can change this workspace spend limit.',
    );
  }
  return { db, userId, membership };
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, membership } = await requireAdmin(request);

  const parsed = PutSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid spend limit', parsed.error.issues);
  }

  const limit = await upsertSpendLimit(getNeonDb(), membership.organizationId, parsed.data, userId);

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    // Switching to `block` is the moment a budget starts refusing people's
    // work, so it is recorded more loudly than a number being adjusted.
    severity: limit.enforcement === 'block' ? 'critical' : 'warning',
    detail: {
      resourceType: 'organization_spend_limit',
      resourceId: membership.organizationId,
      role: membership.role,
      status: limit.enforcement,
      count: limit.monthlyCapCents,
    },
  });

  const payload: SpendLimitResponse = {
    organizationId: membership.organizationId,
    canManageLimit: true,
    currentUserRole: membership.role,
    state: await readSpendState(db, membership.organizationId),
  };
  return NextResponse.json(payload);
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, membership } = await requireAdmin(request);
  const removed = await deleteSpendLimit(getNeonDb(), membership.organizationId);

  if (removed) {
    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId: membership.organizationId,
      request,
      outcome: 'success',
      severity: 'warning',
      detail: {
        resourceType: 'organization_spend_limit',
        resourceId: membership.organizationId,
        role: membership.role,
        status: 'removed',
      },
    });
  }

  const payload: SpendLimitResponse = {
    organizationId: membership.organizationId,
    canManageLimit: true,
    currentUserRole: membership.role,
    state: await readSpendState(db, membership.organizationId),
  };
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
