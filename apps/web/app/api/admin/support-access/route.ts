import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  DEFAULT_SUPPORT_ACCESS_TTL_MS,
  MAX_SUPPORT_ACCESS_TTL_MS,
  MIN_SUPPORT_ACCESS_REASON_LENGTH,
  SUPPORT_ACCESS_SCOPES,
  SupportAccessRequestError,
  approveSupportAccess,
  denySupportAccess,
  listSupportAccessGrants,
  requestSupportAccess,
  revokeSupportAccess,
  verifySupportAccessTrail,
  type SupportAccessGrant,
  type SupportAccessStatus,
} from '@/lib/server/support-access-service';

// Approving is a separate call from requesting: the second operator is the
// control, so a client cannot collapse both into one request.

const GRANT_STATUSES = ['pending', 'approved', 'denied', 'revoked', 'expired'] as const;

const requestSchema = z.object({
  action: z.literal('request'),
  organizationId: z.string().uuid(),
  reason: z.string().min(MIN_SUPPORT_ACCESS_REASON_LENGTH).max(2_000),
  ticketRef: z.string().min(3).max(128),
  scopes: z.array(z.enum(SUPPORT_ACCESS_SCOPES)).min(1),
});

const decisionSchema = z.object({
  action: z.enum(['approve', 'deny', 'revoke']),
  grantId: z.string().uuid(),
  ttlMs: z.number().int().positive().max(MAX_SUPPORT_ACCESS_TTL_MS).optional(),
});

const bodySchema = z.discriminatedUnion('action', [requestSchema, decisionSchema]);

function errorResponse(err: AppError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    },
    { status: err.statusCode },
  );
}

function present(grant: SupportAccessGrant) {
  return {
    id: grant.id,
    organization_id: grant.organizationId,
    requested_by: grant.requestedByUserId,
    approved_by: grant.approvedByUserId,
    revoked_by: grant.revokedByUserId,
    reason: grant.reason,
    ticket_ref: grant.ticketRef,
    scopes: grant.scopes,
    status: grant.status,
    requested_at: grant.requestedAt,
    decided_at: grant.decidedAt,
    expires_at: grant.expiresAt,
    revoked_at: grant.revokedAt,
  };
}

function failure(error: unknown, context: string): NextResponse {
  if (error instanceof SupportAccessRequestError) {
    return errorResponse(createError.badRequest(error.message));
  }
  if (isAppError(error)) {
    logger.warn({ code: error.code }, `${context} denied`);
    return errorResponse(error);
  }
  if (isDbUnavailableError(error)) {
    return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'));
  }
  logger.error({ error }, `${context} failed`);
  return errorResponse(createError.internal());
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;
    await requirePlatformAdmin(request);

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const db = getNeonDb();

    if (searchParams.get('action') === 'verify') {
      if (!organizationId) {
        return errorResponse(
          createError.badRequest('organizationId is required to verify a trail'),
        );
      }
      return NextResponse.json(await verifySupportAccessTrail(db, organizationId));
    }

    const rawStatus = searchParams.get('status');
    if (rawStatus && !(GRANT_STATUSES as readonly string[]).includes(rawStatus)) {
      return errorResponse(
        createError.badRequest(`Invalid status. Must be one of: ${GRANT_STATUSES.join(', ')}`),
      );
    }
    const grants = await listSupportAccessGrants({
      db,
      organizationId,
      status: (rawStatus as SupportAccessStatus | null) ?? null,
      limit: Number.parseInt(searchParams.get('limit') ?? '50', 10),
    });
    return NextResponse.json({ grants: grants.map(present), count: grants.length });
  } catch (error) {
    return failure(error, 'Support-access listing');
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError;

    const { userId } = await requirePlatformAdmin(request);
    const body = await readValidatedJsonBody(
      request,
      bodySchema,
      'Invalid break-glass request body',
    );
    const db = getNeonDb();

    if (body.action === 'request') {
      const grant = await requestSupportAccess({
        db,
        organizationId: body.organizationId,
        requestedByUserId: userId,
        reason: body.reason,
        ticketRef: body.ticketRef,
        scopes: body.scopes,
      });
      await recordAuditEvent({
        userId,
        organizationId: grant.organizationId,
        eventType: 'admin_policy_changed',
        severity: 'warning',
        request,
        detail: {
          resourceType: 'support_access_grant',
          resourceId: grant.id,
          status: grant.status,
          scopes: grant.scopes,
          reason: grant.reason,
        },
      });
      return NextResponse.json({ grant: present(grant) }, { status: 201 });
    }

    const decide =
      body.action === 'approve'
        ? approveSupportAccess
        : body.action === 'deny'
          ? denySupportAccess
          : revokeSupportAccess;
    const grant = await decide({
      db,
      grantId: body.grantId,
      actorUserId: userId,
      ...(body.action === 'approve' ? { ttlMs: body.ttlMs ?? DEFAULT_SUPPORT_ACCESS_TTL_MS } : {}),
    });
    await recordAuditEvent({
      userId,
      organizationId: grant.organizationId,
      eventType: 'admin_policy_changed',
      severity: 'warning',
      request,
      detail: {
        resourceType: 'support_access_grant',
        resourceId: grant.id,
        status: grant.status,
        scopes: grant.scopes,
      },
    });
    return NextResponse.json({ grant: present(grant) });
  } catch (error) {
    return failure(error, 'Support-access decision');
  }
}
