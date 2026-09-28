import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  PluginSubmissionCreateSchema,
  type PluginSubmissionResponse,
  type PluginSubmissionsResponse,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getIdentityUser } from '@/lib/server/identity';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { createSubmission, listUserSubmissions } from '@/lib/services/plugin-submission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFIED = 'verified';
const INDEPENDENT_PUBLISHER = 'Independent developer';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;
  const body: PluginSubmissionsResponse = { submissions: await listUserSubmissions(db, userId) };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const input = await readValidatedJsonBody(
    request,
    PluginSubmissionCreateSchema,
    'Invalid plugin submission',
  );
  const identity = await getIdentityUser(userId);
  if (identity?.primaryEmailVerification !== VERIFIED) {
    throw createError
      .forbidden('Verify your email address before you submit a plugin to the directory.')
      .asUserSafe();
  }
  const sharingRefused = await buildExternalSharingGateResponse(userId, request);
  if (sharingRefused) return sharingRefused;

  const submission = await createSubmission(db, userId, {
    entryId: input.entryId,
    category: input.category ?? null,
    publisherName:
      input.publisherName ?? identity.fullName ?? identity.username ?? INDEPENDENT_PUBLISHER,
  });
  if (!submission) {
    throw createError.notFound('That plugin is not one you uploaded or created.').asUserSafe();
  }
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'plugin_marketplace_changed',
    request,
    detail: {
      resourceType: 'plugin_submission',
      resourceId: submission.id,
      resourceName: submission.pluginKey,
      version: submission.version,
      status: 'submitted',
    },
  });
  const body: PluginSubmissionResponse = { submission };
  return NextResponse.json(body, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
