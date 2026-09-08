import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
  openCloudCodeSessionPullRequest,
} from '@/lib/services/cloud-code-session-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.capabilityUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
}

async function handlePullRequest(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(
      'Managed Code is not enabled for this deployment, so a pull request cannot be opened.',
    );
  }
  if (!isManagedComputePrivateBetaEnabled()) {
    throw createError.serviceUnavailable(
      'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
    );
  }

  const { sessionId } = await context.params;
  try {
    return NextResponse.json(
      await openCloudCodeSessionPullRequest(db, { userId, organizationId }, sessionId),
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handlePullRequest);
