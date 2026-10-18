import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodePullRequestReply } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { openCloudCodeSessionPullRequest } from '@/lib/services/cloud-code-session-service';
import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

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
    const opened: CloudCodePullRequestReply = await openCloudCodeSessionPullRequest(
      db,
      { userId, organizationId },
      sessionId,
    );
    return NextResponse.json(opened);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handlePullRequest);
