import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { EgressPolicyError } from '@/lib/egress-policy';
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
  deleteAuditDestination,
  readAuditDestination,
  setAuditDestinationEnabled,
  upsertAuditDestination,
  type AuditDestination,
} from '@/lib/services/audit-streaming-service';

export const runtime = 'nodejs';

const ENDPOINT_URL_MAX_LENGTH = 2048;

const SaveDestinationSchema = z
  .object({
    endpointUrl: z
      .string()
      .trim()
      .max(ENDPOINT_URL_MAX_LENGTH)
      .url()
      .refine((value) => value.startsWith('https://'), {
        message: 'The endpoint must use https.',
      }),
    enabled: z.boolean().default(true),
  })
  .strict();

const ToggleDestinationSchema = z.object({ enabled: z.boolean() }).strict();

export interface AuditDestinationResponse {
  organizationId: string;
  destination: AuditDestination | null;
}

export interface SavedAuditDestinationResponse extends AuditDestinationResponse {
  signingSecret: string;
}

async function requireAdmin(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can configure audit streaming for this workspace.',
    );
  }

  return { db, userId, membership };
}

function hostOf(endpointUrl: string): string {
  try {
    return new URL(endpointUrl).host;
  } catch {
    return '';
  }
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, membership } = await requireAdmin(request);
  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
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

  const parsed = SaveDestinationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation(
      parsed.error.issues[0]?.message ?? 'Invalid audit destination',
      parsed.error.issues,
    );
  }

  let saved: { destination: AuditDestination; secret: string };
  try {
    saved = await upsertAuditDestination(getNeonDb(), membership.organizationId, {
      endpointUrl: parsed.data.endpointUrl,
      enabled: parsed.data.enabled,
      createdByUserId: userId,
    });
  } catch (error) {
    if (error instanceof EgressPolicyError) {
      throw createError.validation(
        'That endpoint resolves to a private or unreachable address. Use a public https endpoint.',
      );
    }
    throw error;
  }

  await recordAuditEvent({
    userId,
    organizationId: membership.organizationId,
    eventType: 'audit_destination_configured',
    request,
    severity: 'warning',
    detail: {
      resourceType: 'audit_destination',
      resourceId: membership.organizationId,
      resourceName: hostOf(saved.destination.endpointUrl),
      enabled: saved.destination.enabled,
      changedKeys: ['endpointUrl', 'enabled', 'signingSecret'],
      role: membership.role,
    },
  });

  const payload: SavedAuditDestinationResponse = {
    organizationId: membership.organizationId,
    destination: saved.destination,
    signingSecret: saved.secret,
  };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

async function handlePatch(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, membership } = await requireAdmin(request);

  const parsed = ToggleDestinationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid audit destination update', parsed.error.issues);
  }

  const destination = await setAuditDestinationEnabled(
    getNeonDb(),
    membership.organizationId,
    parsed.data.enabled,
  );
  if (!destination) {
    throw createError.notFound('This workspace has no audit destination configured.');
  }

  await recordAuditEvent({
    userId,
    organizationId: membership.organizationId,
    eventType: 'audit_destination_configured',
    request,
    severity: destination.enabled ? 'info' : 'warning',
    detail: {
      resourceType: 'audit_destination',
      resourceId: membership.organizationId,
      resourceName: hostOf(destination.endpointUrl),
      enabled: destination.enabled,
      changedKeys: ['enabled'],
      role: membership.role,
    },
  });

  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
    destination,
  };
  return NextResponse.json(payload);
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, membership } = await requireAdmin(request);

  const existing = await readAuditDestination(db, membership.organizationId);
  const removed = await deleteAuditDestination(getNeonDb(), membership.organizationId);
  if (!removed) {
    throw createError.notFound('This workspace has no audit destination configured.');
  }

  await recordAuditEvent({
    userId,
    organizationId: membership.organizationId,
    eventType: 'audit_destination_deleted',
    request,
    severity: 'critical',
    detail: {
      resourceType: 'audit_destination',
      resourceId: membership.organizationId,
      ...(existing ? { resourceName: hostOf(existing.endpointUrl) } : {}),
      role: membership.role,
    },
  });

  const payload: AuditDestinationResponse = {
    organizationId: membership.organizationId,
    destination: null,
  };
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
