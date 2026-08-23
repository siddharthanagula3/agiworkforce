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
import { EgressPolicyError } from '@/lib/egress-policy';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  deleteAuditDestination,
  readAuditDestination,
  upsertAuditDestination,
  type AuditDestination,
} from '@/lib/services/audit-streaming-service';

export const runtime = 'nodejs';

const PutSchema = z
  .object({
    endpointUrl: z.string().url().max(2048).startsWith('https://'),
    enabled: z.boolean(),
  })
  .strict();

export interface AuditDestinationResponse {
  organizationId: string;
  canManage: boolean;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  destination: AuditDestination | null;
  /** Returned exactly once, on creation. Never readable afterwards. */
  secret?: string;
}

async function requireAdmin(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can configure audit streaming.',
    );
  }
  return { db, userId, membership };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, membership } = await requireAdmin(request);
  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
    canManage: true,
    currentUserRole: membership.role,
    destination: await readAuditDestination(db, membership.organizationId),
  };
  return NextResponse.json(payload);
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await requireAdmin(request);

  const parsed = PutSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid audit destination', parsed.error.issues);
  }

  let saved;
  try {
    saved = await upsertAuditDestination(getNeonDb(), membership.organizationId, {
      endpointUrl: parsed.data.endpointUrl,
      enabled: parsed.data.enabled,
      createdByUserId: userId,
    });
  } catch (error) {
    // A customer-supplied URL that resolves inward is a rejected input, not a
    // server fault, and the message must not echo what it resolved to.
    if (error instanceof EgressPolicyError) {
      throw createError.validation(
        'That endpoint could not be used. It must be an HTTPS URL that resolves to a public address.',
      );
    }
    throw error;
  }

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId: membership.organizationId,
    request,
    outcome: 'success',
    severity: 'warning',
    detail: {
      resourceType: 'organization_audit_destination',
      resourceId: membership.organizationId,
      role: membership.role,
      status: parsed.data.enabled ? 'enabled' : 'disabled',
    },
  });

  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
    canManage: true,
    currentUserRole: membership.role,
    destination: saved.destination,
    secret: saved.secret,
  };
  return NextResponse.json(payload);
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await requireAdmin(request);
  const removed = await deleteAuditDestination(getNeonDb(), membership.organizationId);

  if (removed) {
    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId: membership.organizationId,
      request,
      outcome: 'success',
      severity: 'warning',
      detail: {
        resourceType: 'organization_audit_destination',
        resourceId: membership.organizationId,
        role: membership.role,
        status: 'removed',
      },
    });
  }

  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
    canManage: true,
    currentUserRole: membership.role,
    destination: null,
  };
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
