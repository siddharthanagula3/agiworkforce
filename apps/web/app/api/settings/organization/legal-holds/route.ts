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
  createLegalHold,
  listLegalHolds,
  listRetentionSweeps,
  releaseLegalHold,
  type LegalHold,
  type RetentionSweepRecord,
} from '@/lib/services/retention-service';

export const runtime = 'nodejs';

const CreateHoldSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(2000).nullable().optional(),
    scope: z.enum(['organization', 'member']),
    subjectUserId: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .strict();

const ReleaseHoldSchema = z.object({ holdId: z.string().uuid() }).strict();

export interface LegalHoldsResponse {
  organizationId: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  canManageHolds: boolean;
  holds: LegalHold[];
  sweeps: RetentionSweepRecord[];
}

async function requireAdmin(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can manage legal holds for this workspace.',
    );
  }

  return { db, userId, membership };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, membership } = await requireAdmin(request);

  const [holds, sweeps] = await Promise.all([
    listLegalHolds(db, membership.organizationId, { includeReleased: true }),
    listRetentionSweeps(db, membership.organizationId),
  ]);

  const payload: LegalHoldsResponse = {
    organizationId: membership.organizationId,
    currentUserRole: membership.role,
    canManageHolds: true,
    holds,
    sweeps,
  };
  return NextResponse.json(payload);
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await requireAdmin(request);

  const parsed = CreateHoldSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid legal hold', parsed.error.issues);
  }

  if (parsed.data.scope === 'member' && !parsed.data.subjectUserId) {
    throw createError.validation(
      'A member-scoped hold needs a subject; without one it would hold nothing.',
    );
  }

  // Writes use the privileged connection: the application role has SELECT only
  // on legal_holds (0138), because a hold the held organization can delete is
  // not a hold. Authorization was established above.
  const privileged = getNeonDb();

  let hold: LegalHold;
  try {
    hold = await createLegalHold(privileged, {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      reason: parsed.data.reason ?? null,
      scope: parsed.data.scope,
      subjectUserId: parsed.data.subjectUserId ?? null,
      createdByUserId: userId,
    });
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      throw createError.validation(
        parsed.data.scope === 'organization'
          ? 'This workspace already has an active organization-wide hold.'
          : 'That member is already under an active hold.',
      );
    }
    throw error;
  }

  await recordAuditEvent({
    userId,
    eventType: 'legal_hold_created',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'legal_hold',
      resourceId: hold.id,
      resourceName: hold.name,
      scope: hold.scope,
      targetUserId: hold.subjectUserId ?? undefined,
      role: membership.role,
    },
  });

  return NextResponse.json({ hold }, { status: 201 });
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await requireAdmin(request);

  const parsed = ReleaseHoldSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid legal hold release', parsed.error.issues);
  }

  const released = await releaseLegalHold(
    getNeonDb(),
    membership.organizationId,
    parsed.data.holdId,
    userId,
  );

  // Same answer for "not yours" and "already released", so the endpoint cannot
  // be used to learn which hold ids exist in another workspace.
  if (!released) {
    throw createError.notFound('No active legal hold with that id in this workspace.');
  }

  await recordAuditEvent({
    userId,
    eventType: 'legal_hold_released',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'critical',
    detail: {
      resourceType: 'legal_hold',
      resourceId: released.id,
      resourceName: released.name,
      scope: released.scope,
      targetUserId: released.subjectUserId ?? undefined,
      role: membership.role,
    },
  });

  return NextResponse.json({ hold: released });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
