import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { UpdateCloudCodeEnvironmentRequestSchema } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  deleteCloudCodeEnvironment,
  rethrowCloudCodeEnvironmentError,
  updateCloudCodeEnvironment,
} from '@/lib/services/cloud-code-environment-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ environmentId: string }> };

async function requestBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
}

async function handlePatch(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const parsed = UpdateCloudCodeEnvironmentRequestSchema.safeParse(await requestBody(request));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid environment');
  }
  const { environmentId } = await context.params;
  try {
    const environment = await updateCloudCodeEnvironment(
      db,
      { userId, organizationId },
      environmentId,
      parsed.data,
    );
    const changedKeys = Object.keys(parsed.data).filter((key) => key !== 'fullNetworkAcknowledged');
    if (changedKeys.length > 0) {
      await recordAuditEvent({
        userId,
        organizationId,
        request,
        eventType: 'code_session_lifecycle_changed',
        detail: {
          resourceType: 'code_environment',
          resourceId: environmentId,
          status: 'updated',
          changedKeys,
          ...(changedKeys.includes('networkAccess')
            ? { changesAfter: [`networkAccess:${environment.networkAccess}`] }
            : {}),
        },
      });
    }
    return NextResponse.json({ environment });
  } catch (error) {
    rethrowCloudCodeEnvironmentError(error);
  }
}

async function handleDelete(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const { environmentId } = await context.params;
  try {
    await deleteCloudCodeEnvironment(db, { userId, organizationId }, environmentId);
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: { resourceType: 'code_environment', resourceId: environmentId, status: 'deleted' },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    rethrowCloudCodeEnvironmentError(error);
  }
}

export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
