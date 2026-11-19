import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CreateCloudCodeEnvironmentRequestSchema } from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_ENVIRONMENT_LIMITS } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  createCloudCodeEnvironment,
  listCloudCodeEnvironments,
  rethrowCloudCodeEnvironmentError,
} from '@/lib/services/cloud-code-environment-service';

export const runtime = 'nodejs';

async function requestBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
}

async function handleList(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation-read', `user:${userId}`);
  if (limited) return limited;
  const environments = await listCloudCodeEnvironments(db, { userId, organizationId });
  return NextResponse.json({ environments, limit: CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount });
}

async function handleCreate(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const parsed = CreateCloudCodeEnvironmentRequestSchema.safeParse(await requestBody(request));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid environment');
  }
  try {
    const created = await createCloudCodeEnvironment(db, { userId, organizationId }, parsed.data);
    if (!created.reused) {
      await recordAuditEvent({
        userId,
        organizationId,
        request,
        eventType: 'code_session_lifecycle_changed',
        detail: {
          resourceType: 'code_environment',
          resourceId: created.environment.id,
          status: 'created',
          changesAfter: [`networkAccess:${created.environment.networkAccess}`],
        },
      });
    }
    return NextResponse.json(
      { environment: created.environment },
      { status: created.reused ? 200 : 201 },
    );
  } catch (error) {
    rethrowCloudCodeEnvironmentError(error);
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
