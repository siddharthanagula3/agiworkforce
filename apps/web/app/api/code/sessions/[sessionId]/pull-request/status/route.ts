import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodePullRequestStatusReply } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';
import { readCloudCodeSessionPullRequestStatus } from '@/lib/services/cloud-code-session-service';

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
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleStatus);
