import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodePullRequestStatusReply } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
  readCloudCodeSessionPullRequestStatus,
} from '@/lib/services/cloud-code-session-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleStatus(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const { sessionId } = await context.params;
  try {
    const status: CloudCodePullRequestStatusReply = await readCloudCodeSessionPullRequestStatus(
      db,
      { userId, organizationId },
      sessionId,
    );
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
    if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
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
}

export const GET = withErrorHandler(handleStatus);
